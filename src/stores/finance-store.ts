import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { Account, Category, Transaction, Budget, Currency, Debt, Workspace, WorkspaceRole, WorkspaceMember, Person, ActivityEntry, Reconciliation, Partner, PartnerPosition } from '@/lib/types';
import { CURRENCIES, EXCHANGE_RATES } from '@/lib/mock-data';
import { toast } from '@/stores/toast-store';
import { signoEnCaja } from '@/lib/money';

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
function withBalances(accounts: Account[], transactions: Transaction[]): Account[] {
  const delta = new Map<string, number>();
  for (const tx of transactions) {
    if (!tx.account_id) continue;
    // Ingresos y aportes suman; gastos, retiros, transferencias y cambios
    // restan. Un aporte mueve caja aunque no sea resultado.
    const d = signoEnCaja(tx.type) * Number(tx.amount);
    delta.set(tx.account_id, (delta.get(tx.account_id) ?? 0) + d);
  }
  return accounts.map((a) => ({
    ...a,
    balance: Number(a.initial_balance ?? 0) + (delta.get(a.id) ?? 0),
  }));
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
  | 'partners';

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
): void {
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

  void write().catch((e) => {
    console.error(errorMessage, e);
    commit(undo);
    toast.error(errorMessage);
  });
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
  /** Socios del espacio. Existen aunque todavía no tengan cuenta en la app. */
  partners: Partner[];

  primaryCurrencyId: string;
  isHydrated: boolean;
  user: any | null;
  /** id de public.users (NO el de auth.users). */
  appUserId: string | null;
  /** Habilita secciones todavía no listas para un usuario común. NO es seguridad de datos: eso lo da RLS. */
  isAdmin: boolean;

  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ needsConfirmation: boolean }>;
  logout: () => Promise<void>;

  switchWorkspace: (id: string) => Promise<void>;
  createWorkspace: (name: string, options?: { clone?: boolean }) => Promise<void>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;

  loadMembers: (workspaceId: string) => Promise<void>;
  loadActivity: (workspaceId: string, limit?: number) => Promise<ActivityEntry[]>;
  /** Registra un arqueo. El esperado lo calcula la base, no el cliente. */
  recordReconciliation: (walletId: string, counted: number, note?: string) => Promise<Reconciliation>;
  resolveReconciliation: (
    id: string,
    resolution: 'adjusted' | 'explained',
    note?: string
  ) => Promise<void>;
  inviteMember: (workspaceId: string, email: string) => Promise<'added' | 'invited'>;
  removeMember: (workspaceId: string, member: WorkspaceMember) => Promise<void>;
  leaveWorkspace: (workspaceId: string) => Promise<void>;

  addTransaction: (tx: any) => Promise<void>;
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  revertImportBatch: (batchId: string) => Promise<void>;
  toggleCheckpoint: (id: string, current: boolean) => Promise<void>;
  toggleTransactionStatus: (id: string, status: 'draft' | 'warning' | 'reviewed') => Promise<void>;
  
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
  removeAccount: (id: string) => Promise<void>;
  
  addCategory: (cat: any) => Promise<void>;
  updateCategory: (id: string, data: Partial<Category>) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  /** Interno: resuelve (o crea) el grupo de categorias por nombre. */
  _resolveGroupId: (groupName: string) => Promise<string | null>;
  removeCategoryAndTransfer: (oldId: string, newId: string) => Promise<void>;
  renameCategoryGroup: (oldName: string, newName: string) => Promise<void>;
  
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
  budgets: [],
  exchangeRates: EXCHANGE_RATES,
  workspaces: [],
  currentWorkspaceId: null,
  members: [],
  people: {},
  reconciliations: [],
  partners: [],
  primaryCurrencyId: 'ars',
  isHydrated: false,
  user: null,
  appUserId: null,
  isAdmin: false,

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
      supabase.from('workspaces').select('id,name,created_at').is('deleted_at', null).order('created_at', { ascending: true }),
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

    const [walletsRes, categoriesRes, debtsRes, groupsRes, txs] = await Promise.all([
      withWs(supabase.from('wallets').select('*').is('deleted_at', null).order('created_at', { ascending: true }) as any),
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
      color: '#3b82f6',
      icon: 'wallet',
      created_at: w.created_at
    }));

    for (const tx of txs) {
      const acc = accounts.find((a: any) => a.id === tx.wallet_id);
      if (acc) {
        if (tx.type === 'income') acc.balance += Number(tx.amount);
        if (tx.type === 'expense') acc.balance -= Number(tx.amount);
        if (tx.type === 'transfer' || tx.type === 'exchange') acc.balance -= Number(tx.amount);
      }
    }

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

    set({
      workspaces,
      currentWorkspaceId,
      people,
      accounts,
      budgets,
      reconciliations: ((reconciliationsRes as any).data || []).map((r: any) => ({
        ...r,
        counted_amount: Number(r.counted_amount),
        expected_amount: Number(r.expected_amount),
      })) as Reconciliation[],
      partners: ((partnersRes as any).data || []).map((p: any) => ({
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
      debts: (debtsRes.data || []).map((d: any) => ({
        id: d.id,
        category_id: d.category_id,
        total_amount: Number(d.total_amount),
        currency_code: d.currency_code,
        description: d.description,
        created_at: d.created_at
      })),
      transactions: txs.map((t: any) => ({
        user_id: t.user_id ?? null,
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        currency_id: t.currency_code.toLowerCase(),
        category_id: t.category_id,
        partner_id: t.partner_id ?? null,
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
      })),
    });
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

    const { data, error } = await supabase
      .from('activity_log')
      .select('id,user_id,action,entity,entity_id,summary,changes,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as ActivityEntry[];
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
    set((st) => ({ reconciliations: [saved, ...st.reconciliations] }));
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

  inviteMember: async (workspaceId: string, email: string) => {
    const { data, error } = await supabase.rpc('invite_to_workspace', {
      ws: workspaceId,
      invitee_email: email,
    });
    if (error) throw error;
    await get().loadMembers(workspaceId);
    return data as 'added' | 'invited';
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
      currency_code: tx.currency_id.toUpperCase(),
      date,
    };

    optimistic(
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
  },

  updateTransaction: async (id, data) => {
    const before = get().transactions.find((t) => t.id === id);
    if (!before) return;

    const patch: Record<string, unknown> = {};
    if (data.type) patch.type = data.type;
    if (data.amount) patch.amount = data.amount;
    if (data.currency_id) patch.currency_code = data.currency_id.toUpperCase();
    if (data.category_id !== undefined) patch.category_id = data.category_id;
    if (data.partner_id !== undefined) patch.partner_id = data.partner_id;
    if (data.account_id) patch.wallet_id = data.account_id;
    if (data.description !== undefined) patch.description = data.description;
    if (data.date) patch.date = data.date;
    if (data.period_month !== undefined) patch.period_month = data.period_month;

    optimistic(
      'transactions',
      (list) => byDateDesc(list.map((t: Transaction) => (t.id === id ? { ...t, ...data } : t))),
      (list) => byDateDesc(list.map((t: Transaction) => (t.id === id ? before : t))),
      async () => {
        const { error } = await supabase.from('transactions').update(patch).eq('id', id);
        if (error) throw error;
      },
      'No se pudo guardar el cambio.'
    );
  },

  removeTransaction: async (id) => {
    const before = get().transactions.find((t) => t.id === id);
    if (!before) return;

    optimistic(
      'transactions',
      (list) => list.filter((t: Transaction) => t.id !== id),
      (list) => byDateDesc([before, ...list]),
      async () => {
        const { error } = await supabase
          .from('transactions')
          .update({ deleted_at: nowIso() })
          .eq('id', id);
        if (error) throw error;
      },
      'No se pudo eliminar el movimiento.'
    );
  },

  revertImportBatch: async (loteId) => {
    const { currentWorkspaceId } = get();
    if (!currentWorkspaceId) throw new Error('No hay un espacio activo.');

    const removed = get().transactions.filter((t) => t.import_batch_id === loteId);

    optimistic(
      'transactions',
      (list) => list.filter((t: Transaction) => t.import_batch_id !== loteId),
      (list) => byDateDesc([...removed, ...list]),
      async () => {
        // El lote se identifica por `import_batch_id` (uuid de import_batches) y
        // no por la cadena vieja `import_batch`, que no era única entre espacios:
        // dos espacios que importaban en el mismo milisegundo generaban la misma.
        // Igual se acota al espacio activo, que es barato y cierra el tema.
        const { error } = await supabase
          .from('transactions')
          .update({ deleted_at: nowIso() })
          .eq('workspace_id', currentWorkspaceId)
          .eq('import_batch_id', loteId)
          .is('deleted_at', null);
        if (error) throw error;

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
    // Optimistic UI
    set(state => ({
      transactions: state.transactions.map(t => 
        t.id === id ? { ...t, is_checkpoint: !current } : t
      )
    }));
    
    // DB Update
    const { error } = await supabase.from('transactions').update({ is_checkpoint: !current }).eq('id', id);
    if (error) {
      console.error('Error toggling checkpoint:', error);
      // Revert on failure
      set(state => ({
        transactions: state.transactions.map(t => 
          t.id === id ? { ...t, is_checkpoint: current } : t
        )
      }));
    }
  },

  toggleTransactionStatus: async (id: string, status: 'draft' | 'warning' | 'reviewed') => {
    // Optimistic UI
    const previousStatus = get().transactions.find(t => t.id === id)?.status || 'draft';
    set(state => ({
      transactions: state.transactions.map(t => 
        t.id === id ? { ...t, status } : t
      )
    }));
    
    // DB Update
    const { error } = await supabase.from('transactions').update({ status }).eq('id', id);
    if (error) {
      console.error('Error toggling transaction status:', error);
      // Revert on failure
      set(state => ({
        transactions: state.transactions.map(t => 
          t.id === id ? { ...t, status: previousStatus } : t
        )
      }));
    }
  },

  // === SOCIOS ===
  // El socio es del negocio, no de la app: se carga con nombre y participación
  // mucho antes de que la persona se registre. Cuando se registra se vincula
  // con `user_id` y recién ahí el socio y el usuario son la misma entidad.
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

  removeAccount: async (id) => {
    const before = get().accounts.find((a) => a.id === id);
    if (!before) return;

    optimistic(
      'accounts',
      (list) => list.filter((a: Account) => a.id !== id),
      (list) => [...list, before],
      async () => {
        const { error } = await supabase.from('wallets').update({ deleted_at: nowIso() }).eq('id', id);
        if (error) throw error;
      },
      'No se pudo eliminar la billetera.'
    );
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

  removeCategory: async (id) => {
    const before = get().categories.find((c) => c.id === id);
    if (!before) return;

    optimistic(
      'categories',
      (list) => list.filter((c: Category) => c.id !== id),
      (list) => [...list, before],
      async () => {
        const { error } = await supabase
          .from('categories')
          .update({ deleted_at: nowIso() })
          .eq('id', id);
        if (error) throw error;
      },
      'No se pudo eliminar la categoría.'
    );
  },

  removeCategoryAndTransfer: async (oldId: string, newId: string) => {
    const { currentWorkspaceId } = get();
    if (!currentWorkspaceId) throw new Error('No hay un espacio activo.');

    const before = get().categories.find((c) => c.id === oldId);
    if (!before) return;
    const movedTxIds = get().transactions.filter((t) => t.category_id === oldId).map((t) => t.id);

    // Los movimientos se reapuntan en memoria junto con la baja de la categoría:
    // si no, la lista mostraría "Sin categoría" hasta la próxima recarga.
    set((st) => ({
      transactions: st.transactions.map((t) =>
        t.category_id === oldId ? { ...t, category_id: newId } : t
      ),
    }));

    optimistic(
      'categories',
      (list) => list.filter((c: Category) => c.id !== oldId),
      (list) => {
        set((st) => ({
          transactions: st.transactions.map((t) =>
            movedTxIds.includes(t.id) ? { ...t, category_id: oldId } : t
          ),
        }));
        return [...list, before];
      },
      async () => {
        const ws = (q: any) => q.eq('workspace_id', currentWorkspaceId);
        const r1 = await ws(
          supabase.from('transactions').update({ category_id: newId }).eq('category_id', oldId)
        );
        if (r1.error) throw r1.error;
        const r2 = await ws(
          supabase.from('debts').update({ category_id: newId }).eq('category_id', oldId)
        );
        if (r2.error) throw r2.error;
        const r3 = await ws(
          supabase.from('categories').update({ deleted_at: nowIso() }).eq('id', oldId)
        );
        if (r3.error) throw r3.error;
      },
      'No se pudo reasignar la categoría.'
    );
  },

  renameCategoryGroup: async (oldName: string, newName: string) => {
    const { currentWorkspaceId } = get();
    if (!currentWorkspaceId) throw new Error('No hay un espacio activo.');

    const renameIn = (list: any[], from: string, to: string) =>
      list.map((g: any) => (g.name === from ? { ...g, name: to } : g));

    set((st) => ({
      categories: st.categories.map((c) =>
        c.group_name === oldName ? { ...c, group_name: newName } : c
      ),
    }));

    optimistic(
      'categoryGroups',
      (list) => renameIn(list, oldName, newName),
      (list) => {
        set((st) => ({
          categories: st.categories.map((c) =>
            c.group_name === newName ? { ...c, group_name: oldName } : c
          ),
        }));
        return renameIn(list, newName, oldName);
      },
      async () => {
        // El match es por nombre, no por id: sin acotar al espacio activo esto
        // renombraba el grupo en todos los espacios donde el usuario es miembro
        // —incluidos los compartidos con socios—. Los grupos de sistema
        // (workspace_id NULL) tampoco se tocan: son de todos.
        const r1 = await supabase
          .from('category_groups')
          .update({ name: newName })
          .eq('workspace_id', currentWorkspaceId)
          .eq('name', oldName);
        if (r1.error) throw r1.error;

        const r2 = await supabase
          .from('categories')
          .update({ group_name: newName })
          .eq('workspace_id', currentWorkspaceId)
          .eq('group_name', oldName);
        if (r2.error) throw r2.error;
      },
      'No se pudo renombrar el grupo.'
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
