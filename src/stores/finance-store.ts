import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { Account, Category, Transaction, Budget, Currency, Debt, Workspace, WorkspaceRole, WorkspaceMember, Person, ActivityEntry, Purge, Reconciliation, Partner, PartnerPosition, RegisteredUser, TransactionAttachment } from '@/lib/types';
import { CURRENCIES, EXCHANGE_RATES } from '@/lib/mock-data';
import { toast } from '@/stores/toast-store';
import { signoEnCaja } from '@/lib/money';
import { optimizarLogo } from '@/lib/optimizar-imagen';
import { validarAdjunto, rutaDeAdjunto, tipoDeAdjunto } from '@/lib/adjuntos';
import { puedeCambiar, SOLO_QUIEN_LO_CARGO } from '@/lib/autoria';
import { migrarCategoria, planDeBorrarGrupo, type UsoDeCategoria, type UsoDeGrupo } from '@/lib/categorias';
import type { UsoDeBilletera } from '@/lib/cuentas';

// Todo borrado es lógico: se marca `deleted_at` y la fila queda. Ver DB/021.
const nowIso = () => new Date().toISOString();

/**
 * Devuelve (creándola si hace falta) la categoría donde se asientan los ajustes
 * por arqueo. Vive en su propio grupo para que un ajuste nunca se confunda con
 * un gasto o un ingreso real del negocio.
 */
async function ensureAdjustmentCategory(
  workspaceId: string,
  userId: string,
  type: 'income' | 'expense'
): Promise<string> {
  const GROUP = 'Ajustes';
  const name = type === 'income' ? 'Sobrante de arqueo' : 'Faltante de arqueo';

  let { data: group } = await supabase
    .from('category_groups')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', GROUP)
    .is('deleted_at', null)
    .maybeSingle();

  if (!group) {
    const { data, error } = await supabase
      .from('category_groups')
      .insert({ user_id: userId, workspace_id: workspaceId, name: GROUP, is_system: false })
      .select('id')
      .single();
    if (error) throw error;
    group = data;
  }

  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('group_id', group!.id)
    .eq('name', name)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('categories')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      group_id: group!.id,
      group_name: GROUP,
      name,
      type,
      is_recurring: false,
    })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}


/**
 * El saldo de una billetera es DERIVADO, nunca guardado: saldo inicial más los
 * movimientos que hay en memoria. Así, apenas se agrega un movimiento de forma
 * optimista, el saldo de la billetera ya queda bien sin pedirle nada al
 * servidor. Misma regla que usa hydrate().
 */
export function withBalances(accounts: Account[], transactions: Transaction[]): Account[] {
  const delta = new Map<string, number>();
  const pendiente = new Map<string, number>();
  const ahora = Date.now();

  for (const tx of transactions) {
    if (!tx.account_id) continue;

    // La caja se mueve cuando se mueve la plata, no cuando ocurre el hecho: un
    // cheque emitido en julio a cobrar en septiembre no toca la billetera hasta
    // septiembre. Antes se sumaba todo sin mirar la fecha, así que el saldo
    // descontaba cheques que todavía estaban en la calle: en Samurai eso hacía
    // que Santander figurara en −$6.912.451 cuando en realidad tenía
    // $7.205.371, con $14.117.822 comprometidos.
    const cuando = new Date(tx.settles_at ?? tx.date).getTime();

    if (cuando > ahora) {
      pendiente.set(tx.account_id, (pendiente.get(tx.account_id) ?? 0) + Number(tx.amount));
      continue;
    }

    // Ingresos y aportes suman; gastos, retiros, transferencias y cambios
    // restan. Un aporte mueve caja aunque no sea resultado.
    const d = signoEnCaja(tx.type) * Number(tx.amount);
    delta.set(tx.account_id, (delta.get(tx.account_id) ?? 0) + d);
  }

  const propio = accounts.map((a) => ({
    ...a,
    balance: Number(a.initial_balance ?? 0) + (delta.get(a.id) ?? 0),
    committed: pendiente.get(a.id) ?? 0,
  }));

  // Una billetera que agrupa no tiene movimientos propios: su saldo es la suma
  // de sus subcuentas. Es lo que significa "cuánto efectivo hay" cuando el
  // efectivo está repartido en tres cajas.
  const hijas = new Map<string, typeof propio>();
  for (const a of propio) {
    if (!a.parent_id) continue;
    const g = hijas.get(a.parent_id);
    if (g) g.push(a);
    else hijas.set(a.parent_id, [a]);
  }

  return propio.map((a) => {
    const sub = hijas.get(a.id);
    if (!sub) return a;
    return {
      ...a,
      isGroup: true,
      balance: a.balance + sub.reduce((s, h) => s + h.balance, 0),
      committed: (a.committed ?? 0) + sub.reduce((s, h) => s + (h.committed ?? 0), 0),
    };
  });
}

const byDateDesc = <T extends { date: string }>(list: T[]) =>
  [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

type ListKey =
  | 'transactions'
  | 'accounts'
  | 'categories'
  | 'categoryGroups'
  | 'debts'
  | 'budgets'
  | 'partners'
  | 'attachments';

/**
 * Escritura optimista: el cambio se aplica en memoria YA y la escritura se
 * confirma contra el servidor después. La función vuelve enseguida, así que el
 * modal cierra y la lista se actualiza sin esperar la red.
 *
 * `undo` deshace SOLO este cambio sobre la lista que haya en ese momento, en
 * vez de restaurar una foto del estado anterior. Es la diferencia que importa
 * cuando hay dos escrituras en vuelo: si falla la primera, la segunda no se
 * pierde.
 */
function optimistic(
  key: ListKey,
  apply: (list: any[]) => any[],
  undo: (list: any[]) => any[],
  write: () => Promise<unknown>,
  errorMessage: string
): Promise<boolean> {
  const commit = (fn: (list: any[]) => any[]) =>
    useFinanceStore.setState((s: any) => {
      const next: any = { [key]: fn(s[key]) };
      // Los saldos cuelgan de movimientos y billeteras: si cambia cualquiera de
      // los dos, hay que rederivarlos.
      if (key === 'transactions' || key === 'accounts') {
        next.accounts = withBalances(
          key === 'accounts' ? next.accounts : s.accounts,
          key === 'transactions' ? next.transactions : s.transactions
        );
      }
      return next;
    });

  commit(apply);

  // Devuelve si se guardó, para quien necesite encadenar algo DESPUÉS de que
  // la fila exista de verdad. Casi nadie lo usa: la pantalla ya se actualizó.
  return write().then(
    () => true,
    (e) => {
      console.error(errorMessage, e);
      commit(undo);
      toast.error(errorMessage);
      return false;
    }
  );
}

/**
 * Movimientos recién creados cuya escritura todavía no volvió del servidor.
 *
 * Existe por los adjuntos. Un movimiento nuevo aparece en pantalla al instante,
 * pero en la base todavía no está, y las políticas del bucket preguntan
 * justamente si el movimiento existe. Sin esperar, elegir un ticket al cargar
 * un gasto fallaría siempre — no a veces: siempre, porque el archivo sale
 * antes que la fila.
 */
const escriturasPendientes = new Map<string, Promise<boolean>>();

/**
 * Exige que una escritura haya tocado alguna fila.
 *
 * Un UPDATE que la RLS filtra no da error: "sale bien" sobre cero filas. Sin
 * esto, editar un movimiento ajeno se vería guardado en pantalla y volvería a
 * su valor en la próxima recarga, sin que nadie se entere de por qué.
 */
function exigirFilas(res: { error: unknown; data: unknown[] | null }, motivo: string) {
  if (res.error) throw res.error;
  if (!res.data?.length) throw new Error(motivo);
}

/**
 * El recorte que aplica una vista previa de rol, copiado de las políticas de la
 * base.
 *
 * Durante una vista previa la base NO se entera: la sesión sigue siendo la
 * misma y responde con los permisos reales. Si el cliente no recortara, la
 * pantalla mostraría el menú del colaborador con los datos del dueño — que es
 * exactamente lo contrario de para lo que sirve la vista previa, y peor que no
 * tenerla.
 *
 * Cada línea es el espejo de una política de DB/034. Están juntas a propósito:
 * si se dispersaran por la función, una podría quedar sin actualizar y la vista
 * previa mentiría de nuevo.
 *
 *   transactions, activity_log  →  can_see_all OR user_id = yo
 *   transaction_attachments     →  los de los movimientos visibles (en hydrate)
 *   wallets, partners, debts,
 *   budgets, reconciliations    →  can_see_all
 *   categories, category_groups →  sólo membresía (el colaborador las necesita
 *                                  para clasificar lo que carga)
 */
export function recorteDeVistaPrevia(rol: WorkspaceRole | null) {
  const veTodoElEspacio = rol === 'owner' || rol === 'member';
  return {
    /** Sólo los movimientos propios. */
    soloLoMio: !veTodoElEspacio,
    /** Nada de billeteras, socios, deudas, presupuestos ni arqueos. */
    sinPatrimonio: !veTodoElEspacio,
  };
}

const WS_KEY = 'finza:workspace';
// Devuelve { workspace_id } solo si hay espacio activo (evita romper en modo legacy pre-migración)
const wsPatch = (wsId: string | null) => (wsId ? { workspace_id: wsId } : {});
const readWs = () => (typeof window !== 'undefined' ? localStorage.getItem(WS_KEY) : null);
const writeWs = (id: string | null) => {
  if (typeof window === 'undefined') return;
  if (id) localStorage.setItem(WS_KEY, id);
  else localStorage.removeItem(WS_KEY);
};

interface FinanceState {
  currencies: Currency[];
  accounts: Account[];
  categories: Category[];
  categoryGroups: import('@/lib/types').CategoryGroup[];
  debts: Debt[];
  transactions: Transaction[];
  /** Comprobantes de los movimientos visibles. Ver DB/044. */
  attachments: TransactionAttachment[];
  budgets: Budget[];
  exchangeRates: Record<string, number>;

  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  /** Miembros del espacio actual. Se carga on-demand desde la pantalla de miembros. */
  members: WorkspaceMember[];
  /** Autores del espacio, por id. Sirve para mostrar quién hizo cada cosa. */
  people: Record<string, Person>;
  /** Arqueos del espacio, del más reciente al más viejo. */
  reconciliations: Reconciliation[];
  /** Vaciados de caja, del más reciente al más viejo. Se pueden deshacer. */
  purges: Purge[];
  /** Socios del espacio. Existen aunque todavía no tengan cuenta en la app. */
  partners: Partner[];

  primaryCurrencyId: string;
  isHydrated: boolean;
  user: any | null;
  /** id de public.users (NO el de auth.users). */
  appUserId: string | null;
  /** Habilita secciones todavía no listas para un usuario común. NO es seguridad de datos: eso lo da RLS. */
  isAdmin: boolean;
  /** Mi rol real en el espacio activo. */
  currentRole: WorkspaceRole | null;
  /**
   * Rol que se está PREVISUALIZANDO, para ver la app como la vería otro.
   *
   * Es una vista previa de la interfaz, no un cambio de permisos: la sesión
   * sigue siendo la misma y la base sigue respondiendo con los permisos reales.
   * Sirve para contestar "¿qué le voy a mostrar a la encargada?" antes de
   * invitarla, no para probar si el sistema es seguro. De eso se ocupa RLS.
   */
  previewRole: WorkspaceRole | null;
  setPreviewRole: (role: WorkspaceRole | null) => Promise<void>;

  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ needsConfirmation: boolean }>;
  logout: () => Promise<void>;

  switchWorkspace: (id: string) => Promise<void>;
  createWorkspace: (name: string, options?: { clone?: boolean }) => Promise<void>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  /** Sube el logo del espacio y devuelve su URL pública. */
  uploadWorkspaceLogo: (workspaceId: string, archivo: File) => Promise<string>;
  removeWorkspaceLogo: (workspaceId: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;

  loadMembers: (workspaceId: string) => Promise<void>;
  loadActivity: (workspaceId: string, limit?: number) => Promise<ActivityEntry[]>;
  /** Panel de administración: quién se registró. Sólo responde a un admin. */
  loadRegisteredUsers: () => Promise<RegisteredUser[]>;
  /** Registra un arqueo. El esperado lo calcula la base, no el cliente. */
  recordReconciliation: (walletId: string, counted: number, note?: string) => Promise<Reconciliation>;
  /** Deshace un vaciado: revive sus movimientos y devuelve los saldos iniciales. */
  restaurarPurga: (purgeId: string) => Promise<number>;
  resolveReconciliation: (
    id: string,
    resolution: 'adjusted' | 'explained',
    note?: string
  ) => Promise<void>;
  inviteMember: (workspaceId: string, email: string, role?: WorkspaceRole) => Promise<'added' | 'invited'>;
  /** Cambia el rol de un miembro o de una invitacion todavia sin aceptar. */
  changeMemberRole: (workspaceId: string, member: WorkspaceMember, role: WorkspaceRole) => Promise<void>;
  removeMember: (workspaceId: string, member: WorkspaceMember) => Promise<void>;
  leaveWorkspace: (workspaceId: string) => Promise<void>;

  /** Devuelve el id del movimiento, que ya es el definitivo. */
  addTransaction: (tx: any) => Promise<string>;
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  revertImportBatch: (batchId: string) => Promise<void>;
  toggleCheckpoint: (id: string, current: boolean) => Promise<void>;
  toggleTransactionStatus: (id: string, status: 'draft' | 'warning' | 'reviewed') => Promise<void>;

  /**
   * Cuelga archivos de un movimiento. Aparecen al instante marcados como
   * "subiendo" y se confirman de a uno: si falla uno, los demás siguen.
   * Sirve también para un movimiento que se acaba de crear.
   */
  attachFiles: (transactionId: string, archivos: File[]) => Promise<void>;
  /** Lo saca del movimiento. Borrado lógico: el archivo queda en el bucket. */
  removeAttachment: (id: string) => Promise<void>;
  /**
   * URL firmada para abrir o descargar un adjunto. Vence en un minuto: es para
   * usarla ya, no para guardarla.
   */
  attachmentUrl: (adjunto: TransactionAttachment, opciones?: { descargar?: boolean }) => Promise<string>;
  
  addPartner: (p: { name: string; ownership_pct: number; notes?: string }) => Promise<void>;
  updatePartner: (id: string, data: Partial<Pick<Partner, 'name' | 'ownership_pct' | 'notes' | 'user_id'>>) => Promise<void>;
  removePartner: (id: string) => Promise<void>;
  /** Cuenta corriente de cada socio. La calcula la base, no el cliente. */
  loadPartnerPositions: (workspaceId: string) => Promise<PartnerPosition[]>;
  addDebt: (debt: { name: string; description: string; total_amount: number; currency_code: string }) => Promise<void>;
  updateDebt: (id: string, data: { name: string; description: string; total_amount: number; currency_code: string }) => Promise<void>;
  removeDebt: (id: string) => Promise<void>;
  addAccount: (acc: any) => Promise<void>;
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>;
  /** En qué está usada: movimientos, arqueos, reglas, subcuentas y saldo inicial. */
  accountUsage: (id: string) => Promise<UsoDeBilletera>;
  /**
   * Borra una billetera. Si está en uso, `reemplazoId` es obligatorio: recibe
   * sus movimientos, arqueos, reglas y su saldo inicial. Sus subcuentas quedan
   * sueltas. La base se niega a borrar algo en uso sin reemplazo.
   */
  removeAccount: (id: string, reemplazoId?: string | null) => Promise<void>;
  
  addCategory: (cat: any) => Promise<void>;
  updateCategory: (id: string, data: Partial<Category>) => Promise<void>;
  /** En qué está usada: movimientos (también los de baja), deudas, presupuestos, reglas. */
  categoryUsage: (id: string) => Promise<UsoDeCategoria>;
  /**
   * Borra una categoría. Si está en uso, `reemplazoId` es obligatorio y todo lo
   * que la usaba pasa a esa. La base se niega a borrar algo en uso sin reemplazo.
   */
  removeCategory: (id: string, reemplazoId?: string | null) => Promise<void>;
  /** Cuántas categorías tiene un macrogrupo, por tipo. */
  groupUsage: (id: string) => Promise<UsoDeGrupo>;
  /**
   * Borra un macrogrupo. Si tiene categorías, pasan a `reemplazoId`; las que
   * ya existen ahí con el mismo nombre y tipo se fusionan.
   */
  removeCategoryGroup: (id: string, reemplazoId?: string | null) => Promise<void>;
  /** Interno: resuelve (o crea) el grupo de categorias por nombre. */
  _resolveGroupId: (groupName: string) => Promise<string | null>;
  renameCategoryGroup: (groupId: string, newName: string) => Promise<void>;
  
  addBudget: (budget: Omit<Budget, 'id' | 'created_at'>) => Promise<void>;
  updateBudget: (id: string, data: Partial<Budget>) => Promise<void>;
  removeBudget: (id: string) => Promise<void>;
  
  setPrimaryCurrency: (id: string) => void;
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  currencies: CURRENCIES,
  accounts: [],
  categories: [],
  categoryGroups: [],
  debts: [],
  transactions: [],
  attachments: [],
  budgets: [],
  exchangeRates: EXCHANGE_RATES,
  workspaces: [],
  currentWorkspaceId: null,
  members: [],
  people: {},
  reconciliations: [],
  purges: [],
  partners: [],
  primaryCurrencyId: 'ars',
  isHydrated: false,
  user: null,
  appUserId: null,
  isAdmin: false,
  currentRole: null,
  previewRole: null,

  setPreviewRole: async (role) => {
    // Se rehidrata para que los DATOS también se acoten: el colaborador ve sólo
    // sus movimientos, y sin recargar la vista previa mostraría el menú
    // recortado con los datos completos, que es peor que no tenerla.
    set({ previewRole: role, isHydrated: false });
    await get().hydrate();
  },

  hydrate: async () => {
   try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      set({ isHydrated: true, user: null, accounts: [], categories: [], categoryGroups: [], debts: [], transactions: [], workspaces: [], currentWorkspaceId: null });
      return;
    }

    set({ user: session.user });

    // --- Workspaces (Espacios) ---
    // RLS ya devuelve solo los espacios donde soy miembro: propios y compartidos.
    const { data: userData } = await supabase.from('users').select('id, is_admin').eq('auth_id', session.user.id).single();
    const appUserId: string | null = userData?.id ?? null;
    set({ appUserId, isAdmin: userData?.is_admin === true });

    let workspaces: Workspace[] = [];
    let currentWorkspaceId: string | null = get().currentWorkspaceId || readWs();

    const [wsRes, memRes] = await Promise.all([
      supabase.from('workspaces').select('id,name,logo_url,created_at').is('deleted_at', null).order('created_at', { ascending: true }),
      appUserId
        ? supabase.from('workspace_members').select('workspace_id,role').eq('user_id', appUserId)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const roleByWs = new Map<string, WorkspaceRole>(
      ((memRes as any).data || []).map((m: any) => [m.workspace_id, m.role as WorkspaceRole])
    );

    workspaces = (wsRes.data || []).map((w: any) => ({
      id: w.id,
      name: w.name,
      logo_url: w.logo_url ?? null,
      created_at: w.created_at,
      role: roleByWs.get(w.id) ?? 'member',
    }));

    // Garantizar al menos un espacio (usuarios recién registrados sin invitaciones)
    if (workspaces.length === 0 && appUserId) {
      const { data: created } = await supabase
        .from('workspaces').insert({ user_id: appUserId, name: 'Principal' }).select().single();
      // El trigger on_workspace_created ya lo deja como owner.
      if (created) workspaces = [{ id: created.id, name: created.name, created_at: created.created_at, role: 'owner' }];
    }

    if (!currentWorkspaceId || !workspaces.find((w) => w.id === currentWorkspaceId)) {
      currentWorkspaceId = workspaces[0]?.id ?? null;
    }
    writeWs(currentWorkspaceId);

    const withWs = <T extends { eq: (col: string, val: any) => T }>(q: T): T =>
      currentWorkspaceId ? q.eq('workspace_id', currentWorkspaceId) : q;

    const txPromise = (async () => {
      let allTxs: any[] = [];
      let page = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const { data } = await withWs(
          supabase.from('transactions')
            .select('*')
            .is('deleted_at', null)
            .order('date', { ascending: false }) as any
        ).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (!data || data.length === 0) break;
        allTxs = allTxs.concat(data);
        if (data.length < PAGE_SIZE) break;
        page++;
      }
      return allTxs;
    })();

    // Grupos: incluir los del espacio actual + los de sistema (workspace_id NULL)
    const groupsQuery = currentWorkspaceId
      ? supabase.from('category_groups').select('*').is('deleted_at', null).or(`workspace_id.eq.${currentWorkspaceId},workspace_id.is.null`).order('name', { ascending: true })
      : supabase.from('category_groups').select('*').is('deleted_at', null).order('name', { ascending: true });

    // El colaborador no puede leer la tabla `wallets`: la fila lleva el saldo
    // inicial adentro y no hay forma de esconder una columna con RLS. Para
    // elegir donde entra la plata usa una funcion que devuelve nombre y moneda
    // y ningun saldo (ver DB/034).
    const rolReal = currentWorkspaceId ? (roleByWs.get(currentWorkspaceId) ?? null) : null;

    // Durante una vista previa manda el rol previsualizado, pero SÓLO puede
    // recortar: nadie se da a sí mismo más permisos de los que tiene. La base
    // no se entera de esto y sigue respondiendo con los permisos reales.
    const preview = get().previewRole;
    const rolEfectivo = preview ?? rolReal;

    const soloLoSuyo = rolEfectivo === 'collaborator';

    // El recorte del cliente sólo se aplica MIENTRAS SE PREVISUALIZA. Sin vista
    // previa no hace falta: la base ya devolvió nada más que lo permitido, y
    // filtrar de nuevo acá sólo escondería datos legítimos.
    const recorte = preview ? recorteDeVistaPrevia(preview) : null;

    const [walletsRes, categoriesRes, debtsRes, groupsRes, txs] = await Promise.all([
      soloLoSuyo
        ? supabase.rpc('billeteras_para_cargar', { ws: currentWorkspaceId })
        : withWs(supabase.from('wallets').select('*').is('deleted_at', null).order('created_at', { ascending: true }) as any),
      withWs(supabase.from('categories').select('*, category_groups(name)').is('deleted_at', null).order('created_at', { ascending: true }) as any),
      withWs(supabase.from('debts').select('*').is('deleted_at', null).order('created_at', { ascending: true }) as any),
      groupsQuery,
      txPromise
    ]);

    // Autores del espacio: sin esto el historial y los movimientos mostrarían
    // ids sueltos, porque la política de `users` deja ver sólo la fila propia.
    const people: Record<string, Person> = {};
    if (currentWorkspaceId) {
      // `activity_authors` y no `list_workspace_people`: incluye a quien haya
      // hecho algo aunque hoy ya no sea miembro. Si no, al sacar a alguien del
      // espacio todo su historial pasaría a decir "Sistema".
      const { data: peopleData } = await supabase.rpc('activity_authors', { ws: currentWorkspaceId });
      for (const p of peopleData || []) people[p.id] = p as Person;
    }

    const reconciliationsRes = currentWorkspaceId
      ? await supabase
          .from('wallet_reconciliations')
          .select('*')
          .eq('workspace_id', currentWorkspaceId)
          .is('deleted_at', null)
          .order('counted_at', { ascending: false })
      : { data: [] as any[] };

    const purgesRes = currentWorkspaceId
      ? await supabase
          .from('purges')
          .select('id, user_id, reason, transactions_count, created_at, restored_at')
          .eq('workspace_id', currentWorkspaceId)
          .order('created_at', { ascending: false })
      : { data: [] as any[] };

    // Adjuntos: sólo lo que describe al archivo, no el archivo. Paginado igual
    // que los movimientos, porque en unos años pasan de mil.
    const adjuntos: TransactionAttachment[] = [];
    if (currentWorkspaceId) {
      const PAGINA = 1000;
      for (let pagina = 0; ; pagina++) {
        const { data } = await supabase
          .from('transaction_attachments')
          .select('id, transaction_id, storage_path, file_name, mime_type, size_bytes, user_id, created_at')
          .eq('workspace_id', currentWorkspaceId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .range(pagina * PAGINA, (pagina + 1) * PAGINA - 1);
        if (!data?.length) break;
        // `bigint` llega como texto desde PostgREST.
        adjuntos.push(...data.map((a) => ({ ...a, size_bytes: Number(a.size_bytes) })));
        if (data.length < PAGINA) break;
      }
    }

    const partnersRes = currentWorkspaceId
      ? await supabase
          .from('partners')
          .select('*')
          .eq('workspace_id', currentWorkspaceId)
          .is('deleted_at', null)
          .order('ownership_pct', { ascending: false })
      : { data: [] as any[] };

    const budgetsRes = await withWs(
      supabase
        .from('budgets')
        .select('*, budget_categories(category_id, limit_amount)')
        .is('deleted_at', null)
        .order('created_at', { ascending: true }) as any
    );
    const accounts = (walletsRes.data || []).map((w: any) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      currency_id: w.currency_code.toLowerCase(),
      initial_balance: Number(w.initial_balance || 0),
      balance: Number(w.initial_balance || 0),
      parent_id: w.parent_id ?? null,
      is_default: w.is_default === true,
      allows_deferred_payment: w.allows_deferred_payment === true,
      color: '#3b82f6',
      icon: 'wallet',
      created_at: w.created_at
    }));

    // hydrate calculaba los saldos con su propio bucle, que no conocía las
    // subcuentas ni la fecha de pago: el agrupador quedaba en cero y los
    // cheques sin cobrar ya estaban descontados. Ahora es la misma función que
    // usan las escrituras optimistas, así que las dos vías dan lo mismo.
    const conSaldos = withBalances(
      accounts as Account[],
      txs.map((t: any) => ({
        account_id: t.wallet_id,
        amount: Number(t.amount),
        type: t.type,
        date: t.date,
        settles_at: t.settles_at ?? null,
      })) as Transaction[]
    );

    const budgets: Budget[] = (budgetsRes.data || []).map((b: any) => ({
      id: b.id,
      name: b.name,
      period: b.period,
      currency_id: (b.currency_code || 'ARS').toLowerCase(),
      created_at: b.created_at,
      categories: (b.budget_categories || []).map((bc: any) => ({
        category_id: bc.category_id,
        limit_amount: Number(bc.limit_amount || 0),
        spent_amount: 0, // lo calcula la vista con los movimientos del período
      })),
    }));

    // Los adjuntos siguen a sus movimientos: si el movimiento no se muestra, su
    // comprobante tampoco. Sin vista previa no cambia nada —la base ya devolvió
    // sólo lo visible—; durante una, es lo que evita que el colaborador
    // previsualizado vea el ticket de un movimiento que no ve.
    const txsVisibles = recorte?.soloLoMio ? txs.filter((t: any) => t.user_id === appUserId) : txs;
    const idsVisibles = new Set<string>(txsVisibles.map((t: { id: string }) => t.id));

    set({
      workspaces,
      currentWorkspaceId,
      currentRole: rolReal,
      attachments: adjuntos.filter((a) => idsVisibles.has(a.transaction_id)),
      people,
      budgets: recorte?.sinPatrimonio ? [] : budgets,
      reconciliations: (recorte?.sinPatrimonio ? [] : (reconciliationsRes as any).data || []).map((r: any) => ({
        ...r,
        counted_amount: Number(r.counted_amount),
        expected_amount: Number(r.expected_amount),
      })) as Reconciliation[],
      purges: ((purgesRes as any).data || []) as Purge[],
      accounts: recorte?.sinPatrimonio ? [] : conSaldos,
      partners: (recorte?.sinPatrimonio ? [] : (partnersRes as any).data || []).map((p: any) => ({
        ...p,
        ownership_pct: Number(p.ownership_pct ?? 0),
      })) as Partner[],
      categoryGroups: groupsRes.data || [],
      categories: (categoriesRes.data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        group_id: c.group_id,
        group_name: c.category_groups?.name || c.group_name || 'General',
        color: '#6366f1',
        icon: 'folder',
        is_default: false,
        is_recurring: c.is_recurring || false,
        created_at: c.created_at
      })),
      debts: (recorte?.sinPatrimonio ? [] : debtsRes.data || []).map((d: any) => ({
        id: d.id,
        category_id: d.category_id,
        total_amount: Number(d.total_amount),
        currency_code: d.currency_code,
        description: d.description,
        created_at: d.created_at
      })),
      transactions: txsVisibles.map((t: any) => ({
        user_id: t.user_id ?? null,
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        currency_id: t.currency_code.toLowerCase(),
        category_id: t.category_id,
        partner_id: t.partner_id ?? null,
        settles_at: t.settles_at ?? null,
        reference: t.reference ?? null,
        account_id: t.wallet_id,
        destination_account_id: t.related_transaction_id ? t.related_transaction_id : null,
        description: t.description,
        date: t.date,
        period_month: t.period_month,
        invoiced_at: t.invoiced_at,
        import_batch: t.import_batch,
        import_batch_id: t.import_batch_id ?? null,
        is_checkpoint: t.is_checkpoint,
        status: t.status || 'draft',
        created_at: t.created_at
      })).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      isHydrated: true,
    });
   } catch (e) {
      console.error('Error hidratando datos:', e);
      // Nunca dejar el loader colgado: marcamos hidratado aunque falle
      set({ isHydrated: true });
   }
  },

  switchWorkspace: async (id: string) => {
    if (id === get().currentWorkspaceId) return;
    writeWs(id);
    set({ currentWorkspaceId: id, isHydrated: false });
    await get().hydrate();
  },

  createWorkspace: async (name: string, options?: { clone?: boolean }) => {
    const state = get();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) throw new Error('Usuario no encontrado.');

    let newId: string | null = null;

    if (options?.clone && state.currentWorkspaceId) {
      const { data, error } = await supabase.rpc('clone_workspace', {
        source_ws: state.currentWorkspaceId,
        new_name: name,
      });
      if (error) throw error;
      newId = data as string;
    } else {
      const { data, error } = await supabase.from('workspaces')
        .insert({ user_id: userData.id, name })
        .select()
        .single();
      if (error) throw error;
      newId = data.id;
    }

    if (newId) {
      writeWs(newId);
      set({ currentWorkspaceId: newId, isHydrated: false });
      await get().hydrate();
    }
  },

  renameWorkspace: async (id: string, name: string) => {
    await supabase.from('workspaces').update({ name }).eq('id', id);
    set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)) }));
  },

  uploadWorkspaceLogo: async (workspaceId, archivo) => {
    const optimizada = await optimizarLogo(archivo);

    // Nombre fijo por espacio: al reemplazarlo se pisa el anterior en vez de ir
    // dejando archivos huérfanos que nadie borra nunca.
    const ruta = `${workspaceId}/logo.webp`;

    const { error } = await supabase.storage
      .from('logos')
      .upload(ruta, optimizada, { upsert: true, contentType: 'image/webp' });
    if (error) {
      // El mensaje que devuelve storage —"new row violates row-level security
      // policy"— no le dice nada a quien lo lee en pantalla, y encima apunta a
      // la escritura cuando la causa puede ser otra.
      throw new Error(
        /row-level security/i.test(error.message)
          ? 'No tenés permiso para cambiar el logo de este espacio. Sólo el dueño puede.'
          : error.message
      );
    }

    const { data } = supabase.storage.from('logos').getPublicUrl(ruta);
    // El `?v=` fuerza al navegador a recargarla: la ruta no cambia al
    // reemplazar el logo, así que sin esto seguiría mostrando el viejo.
    const url = `${data.publicUrl}?v=${Date.now()}`;

    const { error: e2 } = await supabase
      .from('workspaces')
      .update({ logo_url: url })
      .eq('id', workspaceId);
    if (e2) throw e2;

    set((st) => ({
      workspaces: st.workspaces.map((w) => (w.id === workspaceId ? { ...w, logo_url: url } : w)),
    }));
    return url;
  },

  removeWorkspaceLogo: async (workspaceId) => {
    const { error } = await supabase.storage.from('logos').remove([`${workspaceId}/logo.webp`]);
    if (error) throw error;

    const { error: e2 } = await supabase
      .from('workspaces')
      .update({ logo_url: null })
      .eq('id', workspaceId);
    if (e2) throw e2;

    set((st) => ({
      workspaces: st.workspaces.map((w) => (w.id === workspaceId ? { ...w, logo_url: null } : w)),
    }));
  },

  deleteWorkspace: async (id: string) => {
    const state = get();
    if (state.workspaces.length <= 1) throw new Error('No podés eliminar tu único espacio.');
    const ws = state.workspaces.find((w) => w.id === id);
    if (ws && ws.role !== 'owner') throw new Error('Solo el dueño puede eliminar un espacio. Podés salir de él.');

    const { error } = await supabase.from('workspaces').update({ deleted_at: nowIso() }).eq('id', id);
    if (error) throw error;

    const remaining = state.workspaces.filter((w) => w.id !== id);
    const nextId = state.currentWorkspaceId === id ? remaining[0]?.id ?? null : state.currentWorkspaceId;
    writeWs(nextId);
    set({ workspaces: remaining, currentWorkspaceId: nextId, isHydrated: false });
    await get().hydrate();
  },

  // === MIEMBROS DEL ESPACIO ===
  loadMembers: async (workspaceId: string) => {
    const { data, error } = await supabase.rpc('list_workspace_members', { ws: workspaceId });
    if (error) throw error;
    set({
      members: (data || []).map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        email: m.email,
        full_name: m.full_name,
        role: m.role as WorkspaceRole,
        pending: m.pending,
        last_sign_in: m.last_sign_in ?? null,
      })),
    });
  },

  loadRegisteredUsers: async () => {
    // El permiso lo valida la base, no el cliente: esconder el botón es
    // presentación, lo que impide leer es que la función corta por is_admin.
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) throw error;
    return (data || []) as RegisteredUser[];
  },

  loadActivity: async (workspaceId: string, limit = 200) => {
    // Los autores se releen acá: `people` se cargó al iniciar sesión, y un
    // socio que entró después aparecería sin nombre hasta recargar la app.
    // Fue exactamente lo que pasó con el primer socio invitado.
    supabase
      .rpc('activity_authors', { ws: workspaceId })
      .then(({ data: gente }) => {
        if (!gente?.length) return;
        set((st) => {
          const people = { ...st.people };
          for (const p of gente) people[p.id] = p as Person;
          return { people };
        });
      });

    // Sólo lo que hizo una persona. Las filas sin autor son migraciones y
    // disparadores de la base: quedan guardadas, pero no tienen nada que
    // decirle a un socio que entra a ver quién movió qué. Se filtra en la
    // consulta y no en la vista, para que el límite cuente movimientos reales.
    const { data, error } = await supabase
      .from('activity_log')
      .select('id,user_id,action,entity,entity_id,summary,changes,created_at')
      .eq('workspace_id', workspaceId)
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as ActivityEntry[];
  },

  restaurarPurga: async (purgeId) => {
    const { currentWorkspaceId } = get();
    if (!currentWorkspaceId) throw new Error('No hay un espacio activo.');

    const { data, error } = await supabase.rpc('restaurar_purga', { purga: purgeId });
    if (error) throw new Error(error.message);

    // Revivir movimientos cambia saldos, totales y gráficos de toda la app: se
    // recarga entero en vez de intentar parchear el estado a mano.
    await get().hydrate();
    return Number(data ?? 0);
  },

  recordReconciliation: async (walletId, counted, note) => {
    const { data, error } = await supabase.rpc('record_reconciliation', {
      w: walletId,
      counted,
      note_text: note ?? null,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const saved = {
      ...row,
      counted_amount: Number(row.counted_amount),
      expected_amount: Number(row.expected_amount),
    } as Reconciliation;

    // Este es el unico caso donde esperar al servidor es correcto: el saldo
    // esperado lo calcula la base dentro de la misma transaccion, para que
    // nadie pueda arquear contra un numero calculado en el cliente. Pero una
    // vez que volvio, se inserta en memoria y listo: no hay motivo para
    // recargar los 1000 movimientos.
    // El conteo nuevo reemplaza al que hubiera abierto de esa billetera, igual
    // que lo hace la base (DB/040). Sin esto el anterior seguiría contando como
    // pendiente en memoria y la alerta mostraría dos diferencias de la misma
    // caja hasta la próxima recarga.
    set((st) => ({
      reconciliations: [
        saved,
        ...st.reconciliations.map((r) =>
          r.wallet_id === saved.wallet_id && r.status === 'pending' && r.id !== saved.id
            ? { ...r, status: 'resolved' as const, resolution: 'superseded' as const }
            : r
        ),
      ],
    }));
    return saved;
  },

  /**
   * Cierra la diferencia de un arqueo.
   *
   * 'adjusted' asienta un movimiento por la diferencia: la plata que falta o
   * sobra queda registrada como un hecho contable visible, no como una
   * corrección silenciosa del saldo.
   * 'explained' sólo deja constancia de que alguien la revisó y sabe por qué.
   */
  resolveReconciliation: async (id, resolution, note) => {
    const { reconciliations, appUserId, currentWorkspaceId } = get();
    const rec = reconciliations.find((r) => r.id === id);
    if (!rec) throw new Error('No se encontró el arqueo.');
    if (!appUserId || !currentWorkspaceId) throw new Error('No hay un espacio activo.');

    let adjustmentId: string | null = null;

    if (resolution === 'adjusted') {
      const diff = rec.counted_amount - rec.expected_amount;
      if (Math.abs(diff) >= 0.01) {
        const wallet = get().accounts.find((a) => a.id === rec.wallet_id);
        if (!wallet) throw new Error('No se encontró la billetera.');

        // Categoría propia para que los ajustes sean identificables y no se
        // mezclen con el gasto real del negocio.
        const type = diff > 0 ? 'income' : 'expense';
        const categoryId = await ensureAdjustmentCategory(currentWorkspaceId, appUserId, type);
        const txId = crypto.randomUUID();
        const description = `Ajuste por arqueo del ${new Date(rec.counted_at).toLocaleDateString('es-AR')}`;

        const { error: txError } = await supabase.from('transactions').insert({
          id: txId,
          user_id: appUserId,
          workspace_id: currentWorkspaceId,
          wallet_id: rec.wallet_id,
          category_id: categoryId,
          type,
          amount: Math.abs(diff),
          currency_code: (wallet.currency_id || 'ars').toUpperCase(),
          description,
          date: rec.counted_at,
          is_checkpoint: false,
          status: 'reviewed',
        });
        if (txError) throw txError;
        adjustmentId = txId;

        // El movimiento de ajuste entra a la lista y mueve el saldo en el acto:
        // sin esto habria que recargar la app para verlo.
        const adjustment: Transaction = {
          id: txId,
          user_id: appUserId,
          type,
          amount: Math.abs(diff),
          currency_id: wallet.currency_id || 'ars',
          category_id: categoryId,
          account_id: rec.wallet_id,
          destination_account_id: null,
          description,
          status: 'reviewed',
          date: rec.counted_at,
          is_checkpoint: false,
          created_at: nowIso(),
        };
        set((st) => ({
          transactions: byDateDesc([adjustment, ...st.transactions]),
          accounts: withBalances(st.accounts, byDateDesc([adjustment, ...st.transactions])),
        }));
      }
    }

    const { error } = await supabase
      .from('wallet_reconciliations')
      .update({
        status: 'resolved',
        resolution,
        adjustment_transaction_id: adjustmentId,
        note: note ?? null,
      })
      .eq('id', id);
    if (error) throw error;

    set((st) => ({
      reconciliations: st.reconciliations.map((r) =>
        r.id === id
          ? { ...r, status: 'resolved', resolution, adjustment_transaction_id: adjustmentId, note: note ?? null }
          : r
      ),
    }));
  },

  inviteMember: async (workspaceId: string, email: string, role: WorkspaceRole = 'member') => {
    const { data, error } = await supabase.rpc('invite_to_workspace', {
      ws: workspaceId,
      invitee_email: email,
      invitee_role: role,
    });
    if (error) throw error;
    await get().loadMembers(workspaceId);
    return data as 'added' | 'invited';
  },

  changeMemberRole: async (workspaceId: string, member: WorkspaceMember, role: WorkspaceRole) => {
    // Una invitacion todavia sin aceptar vive en otra tabla que la membresia.
    const table = member.pending ? 'workspace_invitations' : 'workspace_members';
    const { error } = await supabase.from(table).update({ role }).eq('id', member.id);
    if (error) throw error;
    await get().loadMembers(workspaceId);
  },

  removeMember: async (workspaceId: string, member: WorkspaceMember) => {
    // Una invitación pendiente vive en otra tabla que la membresía ya aceptada.
    // EXCEPCIÓN al borrado lógico: quitarle el acceso a alguien tiene que
    // quitárselo de verdad. Una membresía marcada como borrada seguiría dando
    // true en is_workspace_member() y sería un agujero. Queda en el historial.
    const table = member.pending ? 'workspace_invitations' : 'workspace_members';
    const { error } = await supabase.from(table).delete().eq('id', member.id);
    if (error) throw error;
    await get().loadMembers(workspaceId);
  },

  leaveWorkspace: async (workspaceId: string) => {
    const { appUserId, workspaces } = get();
    if (!appUserId) throw new Error('No hay sesión activa.');
    if (workspaces.length <= 1) throw new Error('No podés salir de tu único espacio.');

    // Misma excepción que removeMember: salir es perder el acceso de verdad.
    const { error } = await supabase
      .from('workspace_members').delete()
      .eq('workspace_id', workspaceId).eq('user_id', appUserId);
    if (error) throw error;

    const remaining = workspaces.filter((w) => w.id !== workspaceId);
    const nextId = remaining[0]?.id ?? null;
    writeWs(nextId);
    set({ workspaces: remaining, currentWorkspaceId: nextId, isHydrated: false });
    await get().hydrate();
  },

  // Antes esto hacia signUp automatico ante CUALQUIER error de signIn, asi que
  // escribir mal la contraseña disparaba un intento de registro. Ahora entrar y
  // registrarse son acciones separadas y explicitas.
  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    set({ user: data.user });
    await get().hydrate();
  },

  signUp: async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName?.trim() || null } },
    });
    if (error) throw error;
    // Si la confirmacion por email esta activada, todavia no hay sesion.
    if (!data.session) return { needsConfirmation: true };
    set({ user: data.user });
    await get().hydrate();
    return { needsConfirmation: false };
  },

  logout: async () => {
    await supabase.auth.signOut();
    // Se limpia TODO: antes quedaban workspaces, deudas y grupos del usuario
    // anterior en memoria hasta la próxima recarga.
    writeWs(null);
    set({
      user: null,
      appUserId: null,
      isAdmin: false,
      accounts: [],
      categories: [],
      categoryGroups: [],
      debts: [],
      transactions: [],
      attachments: [],
      budgets: [],
      workspaces: [],
      currentWorkspaceId: null,
      members: [],
      people: {},
      reconciliations: [],
      partners: [],
      isHydrated: true,
    });
  },

  // === TRANSACTIONS ===
  addTransaction: async (tx) => {
    const { appUserId, currentWorkspaceId } = get();
    if (!appUserId) throw new Error('No hay sesión activa.');

    // El id se genera acá y no en la base: la fila que se pinta al instante ya
    // es la definitiva, así que no hay que reemplazarla cuando el servidor
    // responde ni queda un id provisorio dando vueltas.
    const id = crypto.randomUUID();
    const date = tx.date || nowIso();
    const isTransfer = tx.type === 'transfer' && !!tx.destination_account_id;
    const pairId = isTransfer ? crypto.randomUUID() : null;

    const local: Transaction = {
      id,
      user_id: appUserId,
      type: tx.type,
      amount: tx.amount,
      currency_id: tx.currency_id,
      category_id: tx.category_id || null,
      partner_id: tx.partner_id ?? null,
      account_id: tx.account_id,
      destination_account_id: tx.destination_account_id ?? null,
      description: tx.description,
      status: 'draft',
      date,
      settles_at: tx.settles_at || null,
      period_month: tx.period_month || undefined,
      invoiced_at: tx.invoiced_at || undefined,
      is_checkpoint: false,
      created_at: nowIso(),
    };

    // La pata entrante de una transferencia con monto negativo: así el saldo de
    // la billetera destino sube igual que lo hace en hydrate().
    const localPair: Transaction | null = pairId
      ? {
          ...local,
          id: pairId,
          account_id: tx.destination_account_id,
          destination_account_id: null,
          amount: -Math.abs(tx.amount),
          description: `Transferencia entrante: ${tx.description}`,
        }
      : null;

    const base = {
      user_id: appUserId,
      ...wsPatch(currentWorkspaceId),
      category_id: tx.category_id || null,
      // Sólo los aportes y retiros llevan socio. La base lo exige con un CHECK.
      partner_id: tx.partner_id ?? null,
      // NULL = contado. Sólo se guarda cuando el pago es a plazo.
      settles_at: tx.settles_at || null,
      reference: tx.reference || null,
      currency_code: tx.currency_id.toUpperCase(),
      date,
    };

    const escritura = optimistic(
      'transactions',
      (list) => byDateDesc([local, ...(localPair ? [localPair] : []), ...list]),
      (list) => list.filter((t: Transaction) => t.id !== id && t.id !== pairId),
      async () => {
        const { error } = await supabase.from('transactions').insert({
          ...base,
          id,
          wallet_id: tx.account_id,
          type: tx.type,
          amount: tx.amount,
          description: tx.description,
          period_month: tx.period_month || null,
          invoiced_at: tx.invoiced_at || null,
        });
        if (error) throw error;

        if (localPair) {
          const { error: pairError } = await supabase.from('transactions').insert({
            ...base,
            id: pairId,
            wallet_id: tx.destination_account_id,
            type: 'transfer',
            amount: -Math.abs(tx.amount),
            description: localPair.description,
            related_transaction_id: id,
          });
          if (pairError) throw pairError;
        }
      },
      'No se pudo guardar el movimiento.'
    );
    escriturasPendientes.set(id, escritura);
    void escritura.finally(() => escriturasPendientes.delete(id));
    return id;
  },

  updateTransaction: async (id, data) => {
    const before = get().transactions.find((t) => t.id === id);
    if (!before) return;
    if (!puedeCambiar(before, get().appUserId)) {
      toast.error(SOLO_QUIEN_LO_CARGO);
      return;
    }

    const patch: Record<string, unknown> = {};
    if (data.type) patch.type = data.type;
    if (data.amount) patch.amount = data.amount;
    if (data.currency_id) patch.currency_code = data.currency_id.toUpperCase();
    if (data.category_id !== undefined) patch.category_id = data.category_id;
    if (data.partner_id !== undefined) patch.partner_id = data.partner_id;
    if (data.settles_at !== undefined) patch.settles_at = data.settles_at || null;
    if (data.reference !== undefined) patch.reference = data.reference || null;
    if (data.account_id) patch.wallet_id = data.account_id;
    if (data.description !== undefined) patch.description = data.description;
    if (data.date) patch.date = data.date;
    if (data.period_month !== undefined) patch.period_month = data.period_month;

    optimistic(
      'transactions',
      (list) => byDateDesc(list.map((t: Transaction) => (t.id === id ? { ...t, ...data } : t))),
      (list) => byDateDesc(list.map((t: Transaction) => (t.id === id ? before : t))),
      async () => {
        exigirFilas(
          await supabase.from('transactions').update(patch).eq('id', id).select('id'),
          SOLO_QUIEN_LO_CARGO
        );
      },
      'No se pudo guardar el cambio.'
    );
  },

  removeTransaction: async (id) => {
    const before = get().transactions.find((t) => t.id === id);
    if (!before) return;
    if (!puedeCambiar(before, get().appUserId)) {
      toast.error(SOLO_QUIEN_LO_CARGO);
      return;
    }

    optimistic(
      'transactions',
      (list) => list.filter((t: Transaction) => t.id !== id),
      (list) => byDateDesc([before, ...list]),
      async () => {
        exigirFilas(
          await supabase.from('transactions').update({ deleted_at: nowIso() }).eq('id', id).select('id'),
          SOLO_QUIEN_LO_CARGO
        );
      },
      'No se pudo eliminar el movimiento.'
    );
  },

  revertImportBatch: async (loteId) => {
    const { currentWorkspaceId } = get();
    if (!currentWorkspaceId) throw new Error('No hay un espacio activo.');

    const removed = get().transactions.filter((t) => t.import_batch_id === loteId);

    // Todo o nada. Si parte del lote ya es de otra persona (se reasignó la
    // autoría después de importar), deshacer sólo lo propio dejaría la
    // importación a medias y sin forma de entender qué quedó.
    const ajenos = removed.filter((t) => !puedeCambiar(t, get().appUserId)).length;
    if (ajenos > 0) {
      toast.error(
        `No se puede deshacer: ${ajenos} de los ${removed.length} movimientos de esta importación son de otra persona, y sólo quien cargó un movimiento puede darlo de baja.`
      );
      return;
    }

    optimistic(
      'transactions',
      (list) => list.filter((t: Transaction) => t.import_batch_id !== loteId),
      (list) => byDateDesc([...removed, ...list]),
      async () => {
        // El lote se identifica por `import_batch_id` (uuid de import_batches) y
        // no por la cadena vieja `import_batch`, que no era única entre espacios:
        // dos espacios que importaban en el mismo milisegundo generaban la misma.
        // Igual se acota al espacio activo, que es barato y cierra el tema.
        exigirFilas(
          await supabase
            .from('transactions')
            .update({ deleted_at: nowIso() })
            .eq('workspace_id', currentWorkspaceId)
            .eq('import_batch_id', loteId)
            .is('deleted_at', null)
            .select('id'),
          SOLO_QUIEN_LO_CARGO
        );

        // El lote queda, marcado: sirve para saber que esa importación existió
        // y se deshizo, en vez de desaparecer sin dejar rastro.
        await supabase
          .from('import_batches')
          .update({ reverted_at: nowIso() })
          .eq('id', loteId)
          .eq('workspace_id', currentWorkspaceId);
      },
      'No se pudo deshacer la importación.'
    );
  },

  toggleCheckpoint: async (id: string, current: boolean) => {
    const before = get().transactions.find((t) => t.id === id);
    if (!before) return;
    if (!puedeCambiar(before, get().appUserId)) {
      toast.error(SOLO_QUIEN_LO_CARGO);
      return;
    }

    await optimistic(
      'transactions',
      (list) => list.map((t: Transaction) => (t.id === id ? { ...t, is_checkpoint: !current } : t)),
      (list) => list.map((t: Transaction) => (t.id === id ? { ...t, is_checkpoint: before.is_checkpoint } : t)),
      async () =>
        exigirFilas(
          await supabase.from('transactions').update({ is_checkpoint: !current }).eq('id', id).select('id'),
          SOLO_QUIEN_LO_CARGO
        ),
      'No se pudo marcar el movimiento.'
    );
  },

  toggleTransactionStatus: async (id: string, status: 'draft' | 'warning' | 'reviewed') => {
    const before = get().transactions.find((t) => t.id === id);
    if (!before) return;
    if (!puedeCambiar(before, get().appUserId)) {
      toast.error(SOLO_QUIEN_LO_CARGO);
      return;
    }

    await optimistic(
      'transactions',
      (list) => list.map((t: Transaction) => (t.id === id ? { ...t, status } : t)),
      (list) => list.map((t: Transaction) => (t.id === id ? { ...t, status: before.status } : t)),
      async () =>
        exigirFilas(
          await supabase.from('transactions').update({ status }).eq('id', id).select('id'),
          SOLO_QUIEN_LO_CARGO
        ),
      'No se pudo cambiar el estado del movimiento.'
    );
  },

  // === SOCIOS ===
  // El socio es del negocio, no de la app: se carga con nombre y participación
  // mucho antes de que la persona se registre. Cuando se registra se vincula
  // con `user_id` y recién ahí el socio y el usuario son la misma entidad.
  // === ADJUNTOS ===
  attachFiles: async (transactionId, archivos) => {
    const { currentWorkspaceId, appUserId } = get();
    if (!currentWorkspaceId) throw new Error('No hay un espacio activo.');
    if (!puedeCambiar(get().transactions.find((t) => t.id === transactionId), appUserId)) {
      toast.error(SOLO_QUIEN_LO_CARGO);
      return;
    }

    // Lo que no se puede subir se avisa ANTES de mostrarlo: una fila que
    // aparece y a los dos segundos desaparece es peor que un aviso claro.
    const locales: { archivo: File; adjunto: TransactionAttachment }[] = [];
    for (const archivo of archivos) {
      const problema = validarAdjunto(archivo);
      if (problema) {
        toast.error(problema);
        continue;
      }
      const id = crypto.randomUUID();
      locales.push({
        archivo,
        adjunto: {
          id,
          transaction_id: transactionId,
          storage_path: rutaDeAdjunto(currentWorkspaceId, transactionId, id, archivo.name),
          file_name: archivo.name.slice(0, 255) || 'archivo',
          mime_type: tipoDeAdjunto(archivo),
          size_bytes: archivo.size,
          user_id: appUserId,
          created_at: nowIso(),
          subiendo: true,
        },
      });
    }
    if (!locales.length) return;

    const quitar = (ids: string[]) =>
      set((st) => ({ attachments: st.attachments.filter((a) => !ids.includes(a.id)) }));

    set((st) => ({ attachments: [...st.attachments, ...locales.map((l) => l.adjunto)] }));

    // Un movimiento recién creado todavía no está en la base. Si su escritura
    // falla, sus adjuntos no tienen de qué colgarse: se van con él, y el aviso
    // ya lo dio el movimiento.
    const pendiente = escriturasPendientes.get(transactionId);
    if (pendiente && !(await pendiente)) {
      quitar(locales.map((l) => l.adjunto.id));
      return;
    }

    // De a uno y en paralelo: si falla una foto, las otras dos se guardan igual.
    await Promise.all(
      locales.map(async ({ archivo, adjunto }) => {
        try {
          const { error: eArchivo } = await supabase.storage
            .from('adjuntos')
            .upload(adjunto.storage_path, archivo, {
              contentType: adjunto.mime_type ?? undefined,
              upsert: false,
            });
          if (eArchivo) throw eArchivo;

          const { error: eFila } = await supabase.from('transaction_attachments').insert({
            id: adjunto.id,
            transaction_id: adjunto.transaction_id,
            storage_path: adjunto.storage_path,
            file_name: adjunto.file_name,
            mime_type: adjunto.mime_type,
            size_bytes: adjunto.size_bytes,
          });
          if (eFila) throw eFila;

          set((st) => ({
            attachments: st.attachments.map((a) => (a.id === adjunto.id ? { ...a, subiendo: false } : a)),
          }));
        } catch (e) {
          console.error('No se pudo subir el adjunto', e);
          quitar([adjunto.id]);
          toast.error(`No se pudo subir "${adjunto.file_name}".`);
        }
      })
    );
  },

  removeAttachment: async (id) => {
    const antes = get().attachments.find((a) => a.id === id);
    if (!antes) return;
    if (!puedeCambiar(get().transactions.find((t) => t.id === antes.transaction_id), get().appUserId)) {
      toast.error(SOLO_QUIEN_LO_CARGO);
      return;
    }

    await optimistic(
      'attachments',
      (list) => list.filter((a: TransactionAttachment) => a.id !== id),
      (list) => [...list, antes],
      async () => {
        exigirFilas(
          await supabase.from('transaction_attachments').update({ deleted_at: nowIso() }).eq('id', id).select('id'),
          SOLO_QUIEN_LO_CARGO
        );
      },
      'No se pudo quitar el adjunto.'
    );
  },

  attachmentUrl: async (adjunto, opciones) => {
    const { data, error } = await supabase.storage
      .from('adjuntos')
      .createSignedUrl(
        adjunto.storage_path,
        60,
        // Con `download`, storage responde con Content-Disposition: attachment
        // y el nombre ORIGINAL — no el de la ruta, que lleva el id adelante.
        opciones?.descargar ? { download: adjunto.file_name } : undefined
      );
    if (error || !data?.signedUrl) throw error ?? new Error('No se pudo abrir el adjunto.');
    return data.signedUrl;
  },

  addPartner: async (p) => {
    const { currentWorkspaceId } = get();
    if (!currentWorkspaceId) throw new Error('No hay un espacio activo.');

    const id = crypto.randomUUID();
    const local: Partner = {
      id,
      name: p.name,
      user_id: null,
      ownership_pct: p.ownership_pct,
      notes: p.notes ?? null,
      created_at: nowIso(),
    };

    optimistic(
      'partners',
      (list) => [...list, local].sort((a, b) => b.ownership_pct - a.ownership_pct),
      (list) => list.filter((x: Partner) => x.id !== id),
      async () => {
        const { error } = await supabase.from('partners').insert({
          id,
          workspace_id: currentWorkspaceId,
          name: p.name,
          ownership_pct: p.ownership_pct,
          notes: p.notes ?? null,
        });
        if (error) throw error;
      },
      'No se pudo agregar el socio.'
    );
  },

  updatePartner: async (id, data) => {
    const before = get().partners.find((p) => p.id === id);
    if (!before) return;

    optimistic(
      'partners',
      (list) =>
        list
          .map((p: Partner) => (p.id === id ? { ...p, ...data } : p))
          .sort((a: Partner, b: Partner) => b.ownership_pct - a.ownership_pct),
      (list) => list.map((p: Partner) => (p.id === id ? before : p)),
      async () => {
        const { error } = await supabase.from('partners').update(data).eq('id', id);
        if (error) throw error;
      },
      'No se pudo guardar el socio.'
    );
  },

  removePartner: async (id) => {
    const before = get().partners.find((p) => p.id === id);
    if (!before) return;

    // Los aportes y retiros ya cargados NO se borran: son plata que se movió de
    // verdad. El socio queda de baja y su historial sigue existiendo.
    optimistic(
      'partners',
      (list) => list.filter((p: Partner) => p.id !== id),
      (list) => [...list, before],
      async () => {
        const { error } = await supabase
          .from('partners')
          .update({ deleted_at: nowIso() })
          .eq('id', id);
        if (error) throw error;
      },
      'No se pudo eliminar el socio.'
    );
  },

  loadPartnerPositions: async (workspaceId: string) => {
    const { data, error } = await supabase.rpc('partner_positions', { ws: workspaceId });
    if (error) throw error;
    return (data || []).map((p: any) => ({
      ...p,
      ownership_pct: Number(p.ownership_pct ?? 0),
      aportes: Number(p.aportes ?? 0),
      retiros: Number(p.retiros ?? 0),
      saldo: Number(p.saldo ?? 0),
      retiros_pct: p.retiros_pct === null ? null : Number(p.retiros_pct),
    })) as PartnerPosition[];
  },

  // === DEBTS ===
  // Una deuda son dos filas: la deuda y una categoria homonima donde se
  // imputan los pagos. Las dos se crean y se dan de baja juntas.
  addDebt: async (debt) => {
    const { appUserId, currentWorkspaceId } = get();
    if (!appUserId) throw new Error('No hay sesión activa.');

    const debtId = crypto.randomUUID();
    const categoryId = crypto.randomUUID();

    const localCategory: Category = {
      id: categoryId,
      name: debt.name,
      type: 'expense',
      group_name: 'Deudas',
      color: '#6366f1',
      icon: 'folder',
      is_default: false,
      is_recurring: false,
      created_at: nowIso(),
    };
    const localDebt: Debt = {
      id: debtId,
      category_id: categoryId,
      total_amount: debt.total_amount,
      currency_code: debt.currency_code,
      description: debt.description,
      created_at: nowIso(),
    };

    set((st) => ({ categories: [...st.categories, localCategory] }));

    optimistic(
      'debts',
      (list) => [...list, localDebt],
      (list) => {
        set((st) => ({ categories: st.categories.filter((c) => c.id !== categoryId) }));
        return list.filter((d: Debt) => d.id !== debtId);
      },
      async () => {
        const { data: groupData, error: groupError } = await supabase
          .from('category_groups')
          .select('id')
          .eq('name', 'Deudas')
          .is('is_system', true)
          .single();
        if (groupError) throw groupError;

        const { error: catError } = await supabase.from('categories').insert({
          id: categoryId,
          user_id: appUserId,
          ...wsPatch(currentWorkspaceId),
          name: debt.name,
          group_id: groupData.id,
          type: 'expense',
        });
        if (catError) throw catError;

        const { error: debtError } = await supabase.from('debts').insert({
          id: debtId,
          user_id: appUserId,
          ...wsPatch(currentWorkspaceId),
          category_id: categoryId,
          total_amount: debt.total_amount,
          currency_code: debt.currency_code,
          description: debt.description,
        });
        if (debtError) throw debtError;

        set((st) => ({
          categories: st.categories.map((c) =>
            c.id === categoryId ? { ...c, group_id: groupData.id } : c
          ),
        }));
      },
      'No se pudo crear la deuda.'
    );
  },

  updateDebt: async (id, data) => {
    const before = get().debts.find((d) => d.id === id);
    if (!before) return;
    const beforeCategory = get().categories.find((c) => c.id === before.category_id);

    set((st) => ({
      categories: st.categories.map((c) =>
        c.id === before.category_id ? { ...c, name: data.name } : c
      ),
    }));

    optimistic(
      'debts',
      (list) =>
        list.map((d: Debt) =>
          d.id === id
            ? {
                ...d,
                total_amount: data.total_amount,
                currency_code: data.currency_code,
                description: data.description,
              }
            : d
        ),
      (list) => {
        if (beforeCategory) {
          set((st) => ({
            categories: st.categories.map((c) => (c.id === beforeCategory.id ? beforeCategory : c)),
          }));
        }
        return list.map((d: Debt) => (d.id === id ? before : d));
      },
      async () => {
        const { error: catError } = await supabase
          .from('categories')
          .update({ name: data.name })
          .eq('id', before.category_id);
        if (catError) throw catError;

        const { error } = await supabase
          .from('debts')
          .update({
            total_amount: data.total_amount,
            currency_code: data.currency_code,
            description: data.description,
          })
          .eq('id', id);
        if (error) throw error;
      },
      'No se pudo guardar la deuda.'
    );
  },

  removeDebt: async (id) => {
    const before = get().debts.find((d) => d.id === id);
    if (!before) return;
    const beforeCategory = get().categories.find((c) => c.id === before.category_id);

    set((st) => ({ categories: st.categories.filter((c) => c.id !== before.category_id) }));

    optimistic(
      'debts',
      (list) => list.filter((d: Debt) => d.id !== id),
      (list) => {
        if (beforeCategory) set((st) => ({ categories: [...st.categories, beforeCategory] }));
        return [...list, before];
      },
      async () => {
        // Antes se borraba la categoria y el CASCADE se llevaba la deuda. Ahora
        // el borrado es logico en las dos, asi que hay que marcarlas a mano.
        const stamp = nowIso();
        const { error: e1 } = await supabase.from('debts').update({ deleted_at: stamp }).eq('id', id);
        if (e1) throw e1;
        const { error: e2 } = await supabase
          .from('categories')
          .update({ deleted_at: stamp })
          .eq('id', before.category_id);
        if (e2) throw e2;
      },
      'No se pudo eliminar la deuda.'
    );
  },

  // === ACCOUNTS ===
  addAccount: async (acc) => {
    const { appUserId, currentWorkspaceId } = get();
    if (!appUserId) throw new Error('No hay sesión activa.');

    const id = crypto.randomUUID();
    const local: Account = {
      id,
      name: acc.name,
      type: acc.type,
      currency_id: acc.currency_id,
      initial_balance: Number(acc.initial_balance || 0),
      balance: Number(acc.initial_balance || 0),
      parent_id: acc.parent_id || null,
      allows_deferred_payment: acc.allows_deferred_payment === true,
      color: '#3b82f6',
      icon: 'wallet',
      created_at: nowIso(),
    };

    optimistic(
      'accounts',
      (list) => [...list, local],
      (list) => list.filter((a: Account) => a.id !== id),
      async () => {
        const { error } = await supabase.from('wallets').insert({
          id,
          user_id: appUserId,
          ...wsPatch(currentWorkspaceId),
          name: acc.name,
          type: acc.type,
          initial_balance: acc.initial_balance || 0,
          currency_code: acc.currency_id.toUpperCase(),
          parent_id: acc.parent_id || null,
          allows_deferred_payment: acc.allows_deferred_payment === true,
        });
        if (error) throw error;
      },
      'No se pudo crear la billetera.'
    );
  },

  updateAccount: async (id, data) => {
    const before = get().accounts.find((a) => a.id === id);
    if (!before) return;

    const patch: Record<string, unknown> = {};
    if (data.name) patch.name = data.name;
    if (data.type) patch.type = data.type;
    if (data.currency_id) patch.currency_code = data.currency_id.toUpperCase();
    if (data.initial_balance !== undefined) patch.initial_balance = data.initial_balance;
    if (data.parent_id !== undefined) patch.parent_id = data.parent_id || null;
    if (data.allows_deferred_payment !== undefined) patch.allows_deferred_payment = data.allows_deferred_payment;

    optimistic(
      'accounts',
      (list) => list.map((a: Account) => (a.id === id ? { ...a, ...data } : a)),
      (list) => list.map((a: Account) => (a.id === id ? before : a)),
      async () => {
        const { error } = await supabase.from('wallets').update(patch).eq('id', id);
        if (error) throw error;
      },
      'No se pudo guardar la billetera.'
    );
  },

  accountUsage: async (id) => {
    const { data, error } = await supabase.rpc('uso_de_billetera', { billetera: id });
    if (error) throw error;
    return data as UsoDeBilletera;
  },

  removeAccount: async (id, reemplazoId) => {
    const antes = get();
    const cuenta = antes.accounts.find((a) => a.id === id);
    if (!cuenta) return;

    // Lo que se va a tocar, para deshacer exactamente eso si la base se niega.
    const movidos = new Set(antes.transactions.filter((t) => t.account_id === id).map((t) => t.id));
    const hijas = antes.accounts.filter((a) => a.parent_id === id).map((a) => a.id);
    const destinoAntes = reemplazoId ? antes.accounts.find((a) => a.id === reemplazoId) : undefined;

    set((st) => {
      const cuentas = st.accounts
        .filter((a) => a.id !== id)
        // Las subcuentas quedan sueltas, igual que en la base.
        .map((a) => (a.parent_id === id ? { ...a, parent_id: null } : a))
        // El saldo inicial se suma: si no, desaparece plata que existe.
        .map((a) =>
          a.id === reemplazoId
            ? { ...a, initial_balance: (a.initial_balance ?? 0) + (cuenta.initial_balance ?? 0) }
            : a
        );
      const movimientos = reemplazoId
        ? st.transactions.map((t) => (t.account_id === id ? { ...t, account_id: reemplazoId } : t))
        : st.transactions;
      return { accounts: withBalances(cuentas, movimientos), transactions: movimientos };
    });

    const { error } = await supabase.rpc('borrar_billetera', { billetera: id, reemplazo: reemplazoId ?? null });
    if (!error) return;

    console.error('No se pudo eliminar la billetera', error);
    set((st) => {
      const cuentas = st.accounts
        .map((a) => (hijas.includes(a.id) ? { ...a, parent_id: id } : a))
        .map((a) => (a.id === reemplazoId && destinoAntes ? destinoAntes : a));
      const movimientos = st.transactions.map((t) => (movidos.has(t.id) ? { ...t, account_id: id } : t));
      return {
        accounts: withBalances(cuentas.some((a) => a.id === id) ? cuentas : [...cuentas, cuenta], movimientos),
        transactions: movimientos,
      };
    });
    // El mensaje de la base está escrito para quien lo lee.
    toast.error(error.message || 'No se pudo eliminar la billetera.');
  },

  // === CATEGORIES ===
  /**
   * Resuelve el grupo por nombre, creandolo si no existe. Corre DENTRO de la
   * escritura optimista, no antes: la categoria ya se ve en pantalla mientras
   * esto pasa.
   */
  _resolveGroupId: async (groupName: string): Promise<string | null> => {
    const { appUserId, currentWorkspaceId, categoryGroups } = get();
    const existing = categoryGroups.find((g: any) => g.name === groupName);
    if (existing) return existing.id;
    if (!appUserId) return null;

    const { data, error } = await supabase
      .from('category_groups')
      .insert({ name: groupName, user_id: appUserId, is_system: false, ...wsPatch(currentWorkspaceId) })
      .select()
      .single();
    if (error) throw error;

    set((st) => ({ categoryGroups: [...st.categoryGroups, data] }));
    return data.id;
  },

  addCategory: async (cat) => {
    const { appUserId, currentWorkspaceId } = get();
    if (!appUserId) throw new Error('No hay sesión activa.');

    const id = crypto.randomUUID();
    const groupName = cat.group_name || 'General';
    const local: Category = {
      id,
      name: cat.name,
      type: cat.type,
      group_id: get().categoryGroups.find((g: any) => g.name === groupName)?.id,
      group_name: groupName,
      color: '#6366f1',
      icon: 'folder',
      is_default: false,
      is_recurring: cat.is_recurring || false,
      created_at: nowIso(),
    };

    optimistic(
      'categories',
      (list) => [...list, local],
      (list) => list.filter((c: Category) => c.id !== id),
      async () => {
        const groupId = await get()._resolveGroupId(groupName);
        const { error } = await supabase.from('categories').insert({
          id,
          user_id: appUserId,
          ...wsPatch(currentWorkspaceId),
          name: cat.name,
          type: cat.type,
          group_name: groupName,
          group_id: groupId,
          is_recurring: cat.is_recurring || false,
        });
        if (error) throw error;
        // El grupo puede haberse creado recién: que la categoría en memoria
        // apunte al id real y no quede huérfana.
        if (groupId) {
          set((st) => ({
            categories: st.categories.map((c) => (c.id === id ? { ...c, group_id: groupId } : c)),
          }));
        }
      },
      'No se pudo crear la categoría.'
    );
  },

  updateCategory: async (id, data) => {
    const before = get().categories.find((c) => c.id === id);
    if (!before) return;

    optimistic(
      'categories',
      (list) => list.map((c: Category) => (c.id === id ? { ...c, ...data } : c)),
      (list) => list.map((c: Category) => (c.id === id ? before : c)),
      async () => {
        const patch: Record<string, unknown> = {};
        if (data.name) patch.name = data.name;
        if (data.type) patch.type = data.type;
        if (data.is_recurring !== undefined) patch.is_recurring = data.is_recurring;
        if (data.group_name) {
          patch.group_name = data.group_name;
          // Antes esto usaba `get().user.id`, que es el id de auth.users y no el
          // de public.users: el grupo se creaba con un user_id inexistente.
          const groupId = await get()._resolveGroupId(data.group_name);
          if (groupId) patch.group_id = groupId;
        }

        const { error } = await supabase.from('categories').update(patch).eq('id', id);
        if (error) throw error;
      },
      'No se pudo guardar la categoría.'
    );
  },

  categoryUsage: async (id) => {
    const { data, error } = await supabase.rpc('uso_de_categoria', { cat: id });
    if (error) throw error;
    return data as UsoDeCategoria;
  },

  removeCategory: async (id, reemplazoId) => {
    const antes = get();
    const categoria = antes.categories.find((c) => c.id === id);
    if (!categoria) return;

    // Lo que se va a tocar, para deshacer EXACTAMENTE eso si la base se niega.
    const txs = new Set(antes.transactions.filter((t) => t.category_id === id).map((t) => t.id));
    const deudas = new Set(antes.debts.filter((d) => d.category_id === id).map((d) => d.id));
    const presupuestos = antes.budgets.filter((b) => b.categories.some((l) => l.category_id === id));

    set((st) => ({
      categories: st.categories.filter((c) => c.id !== id),
      ...(reemplazoId
        ? migrarCategoria({ transactions: st.transactions, debts: st.debts, budgets: st.budgets }, id, reemplazoId)
        : {}),
    }));

    const { error } = await supabase.rpc('borrar_categoria', { cat: id, reemplazo: reemplazoId ?? null });
    if (!error) return;

    console.error('No se pudo eliminar la categoría', error);
    set((st) => ({
      categories: st.categories.some((c) => c.id === id) ? st.categories : [...st.categories, categoria],
      transactions: st.transactions.map((t) => (txs.has(t.id) ? { ...t, category_id: id } : t)),
      debts: st.debts.map((d) => (deudas.has(d.id) ? { ...d, category_id: id } : d)),
      budgets: st.budgets.map((b) => presupuestos.find((p) => p.id === b.id) ?? b),
    }));
    // Los mensajes de estas funciones están escritos para quien los lee
    // ("está en uso: elegí con cuál reemplazarla").
    toast.error(error.message || 'No se pudo eliminar la categoría.');
  },

  groupUsage: async (id) => {
    const { data, error } = await supabase.rpc('uso_de_grupo', { grupo: id });
    if (error) throw error;
    return data as UsoDeGrupo;
  },

  removeCategoryGroup: async (id, reemplazoId) => {
    const antes = get();
    const grupo = antes.categoryGroups.find((g) => g.id === id);
    if (!grupo) return;

    const destino = reemplazoId ? antes.categoryGroups.find((g) => g.id === reemplazoId) : undefined;
    const plan = reemplazoId ? planDeBorrarGrupo(antes.categories, id, reemplazoId) : { mover: [], fusionar: [] };
    const fusionadas = new Set(plan.fusionar.map((f) => f.origen));
    const movidas = new Set(plan.mover);

    // Para deshacer: las categorías del grupo tal como estaban, y a qué
    // categoría apuntaba cada movimiento, deuda y presupuesto que se fusiona.
    const categoriasAntes = antes.categories.filter((c) => c.group_id === id);
    const txAntes = new Map(
      antes.transactions.filter((t) => t.category_id && fusionadas.has(t.category_id)).map((t) => [t.id, t.category_id!])
    );
    const deudasAntes = new Map(
      antes.debts.filter((d) => fusionadas.has(d.category_id)).map((d) => [d.id, d.category_id])
    );
    const presupuestosAntes = antes.budgets.filter((b) => b.categories.some((l) => fusionadas.has(l.category_id)));

    set((st) => {
      let listas = { transactions: st.transactions, debts: st.debts, budgets: st.budgets };
      for (const f of plan.fusionar) listas = migrarCategoria(listas, f.origen, f.destino);
      return {
        ...listas,
        categoryGroups: st.categoryGroups.filter((g) => g.id !== id),
        categories: st.categories
          .filter((c) => !fusionadas.has(c.id))
          .map((c) =>
            movidas.has(c.id) ? { ...c, group_id: reemplazoId!, group_name: destino?.name ?? c.group_name } : c
          ),
      };
    });

    const { error } = await supabase.rpc('borrar_grupo', { grupo: id, reemplazo: reemplazoId ?? null });
    if (!error) return;

    console.error('No se pudo eliminar el macrogrupo', error);
    const idsDelGrupo = new Set(categoriasAntes.map((c) => c.id));
    set((st) => ({
      categoryGroups: st.categoryGroups.some((g) => g.id === id) ? st.categoryGroups : [...st.categoryGroups, grupo],
      categories: [...st.categories.filter((c) => !idsDelGrupo.has(c.id)), ...categoriasAntes],
      transactions: st.transactions.map((t) => (txAntes.has(t.id) ? { ...t, category_id: txAntes.get(t.id)! } : t)),
      debts: st.debts.map((d) => (deudasAntes.has(d.id) ? { ...d, category_id: deudasAntes.get(d.id)! } : d)),
      budgets: st.budgets.map((b) => presupuestosAntes.find((p) => p.id === b.id) ?? b),
    }));
    toast.error(error.message || 'No se pudo eliminar el macrogrupo.');
  },

  renameCategoryGroup: async (groupId, newName) => {
    const grupo = get().categoryGroups.find((g) => g.id === groupId);
    if (!grupo) return;
    const nombreViejo = grupo.name;

    // Por id y no por nombre: dos espacios pueden tener un grupo que se llama
    // igual. El nombre que repite cada categoría lo actualiza la base (DB/047);
    // acá se actualiza en memoria sólo para que la pantalla no espere.
    set((st) => ({
      categories: st.categories.map((c) => (c.group_id === groupId ? { ...c, group_name: newName } : c)),
    }));

    await optimistic(
      'categoryGroups',
      (list) => list.map((g: any) => (g.id === groupId ? { ...g, name: newName } : g)),
      (list) => {
        set((st) => ({
          categories: st.categories.map((c) => (c.group_id === groupId ? { ...c, group_name: nombreViejo } : c)),
        }));
        return list.map((g: any) => (g.id === groupId ? { ...g, name: nombreViejo } : g));
      },
      async () =>
        exigirFilas(
          await supabase.from('category_groups').update({ name: newName }).eq('id', groupId).select('id'),
          'No tenés permiso para renombrar este macrogrupo.'
        ),
      'No se pudo renombrar el macrogrupo.'
    );
  },

  // === BUDGETS ===
  // Antes esto vivia solo en memoria con Date.now() como id y se perdia al
  // recargar. Ahora persiste en budgets + budget_categories.
  addBudget: async (budget) => {
    const { appUserId, currentWorkspaceId } = get();
    if (!appUserId || !currentWorkspaceId) throw new Error('No hay un espacio activo.');

    const id = crypto.randomUUID();
    const lines = (budget.categories || []).filter((c: any) => c.category_id);
    const local: Budget = {
      id,
      name: budget.name,
      period: budget.period,
      currency_id: budget.currency_id || 'ars',
      created_at: nowIso(),
      categories: lines.map((c: any) => ({
        category_id: c.category_id,
        limit_amount: c.limit_amount,
        spent_amount: 0,
      })),
    };

    optimistic(
      'budgets',
      (list) => [...list, local],
      (list) => list.filter((b: Budget) => b.id !== id),
      async () => {
        const { error } = await supabase.from('budgets').insert({
          id,
          user_id: appUserId,
          workspace_id: currentWorkspaceId,
          name: budget.name,
          period: budget.period,
          currency_code: (budget.currency_id || 'ars').toUpperCase(),
        });
        if (error) throw error;

        if (lines.length) {
          const { error: lineError } = await supabase.from('budget_categories').insert(
            lines.map((c: any) => ({
              budget_id: id,
              category_id: c.category_id,
              limit_amount: c.limit_amount,
            }))
          );
          // Sin lineas el presupuesto no significa nada: se deshace para no
          // dejar un registro a medias. No es un borrado del usuario.
          if (lineError) {
            await supabase.from('budgets').delete().eq('id', id);
            throw lineError;
          }
        }
      },
      'No se pudo crear el presupuesto.'
    );
  },

  updateBudget: async (id, data) => {
    const before = get().budgets.find((b) => b.id === id);
    if (!before) return;

    optimistic(
      'budgets',
      (list) =>
        list.map((b: Budget) =>
          b.id === id
            ? {
                ...b,
                ...data,
                categories: data.categories
                  ? data.categories.map((c: any) => ({ ...c, spent_amount: 0 }))
                  : b.categories,
              }
            : b
        ),
      (list) => list.map((b: Budget) => (b.id === id ? before : b)),
      async () => {
        const patch: Record<string, unknown> = {};
        if (data.name !== undefined) patch.name = data.name;
        if (data.period !== undefined) patch.period = data.period;
        if (data.currency_id !== undefined) patch.currency_code = data.currency_id.toUpperCase();

        if (Object.keys(patch).length) {
          const { error } = await supabase.from('budgets').update(patch).eq('id', id);
          if (error) throw error;
        }

        if (data.categories) {
          // Reemplazo completo: es mas simple y predecible que diferenciar
          // altas, bajas y cambios de una lista corta. Tampoco es un borrado
          // del usuario: son lineas hijas sin identidad propia fuera del
          // presupuesto.
          const { error: delError } = await supabase
            .from('budget_categories')
            .delete()
            .eq('budget_id', id);
          if (delError) throw delError;

          const lines = data.categories.filter((c: any) => c.category_id);
          if (lines.length) {
            const { error: insError } = await supabase.from('budget_categories').insert(
              lines.map((c: any) => ({
                budget_id: id,
                category_id: c.category_id,
                limit_amount: c.limit_amount,
              }))
            );
            if (insError) throw insError;
          }
        }
      },
      'No se pudo guardar el presupuesto.'
    );
  },

  removeBudget: async (id) => {
    const before = get().budgets.find((b) => b.id === id);
    if (!before) return;

    optimistic(
      'budgets',
      (list) => list.filter((b: Budget) => b.id !== id),
      (list) => [...list, before],
      async () => {
        const { error } = await supabase.from('budgets').update({ deleted_at: nowIso() }).eq('id', id);
        if (error) throw error;
      },
      'No se pudo eliminar el presupuesto.'
    );
  },

  setPrimaryCurrency: (id) => set({ primaryCurrencyId: id }),
}));
