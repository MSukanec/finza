import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { Account, Category, Transaction, Budget, Currency, Debt, Workspace, WorkspaceRole, WorkspaceMember, Person, ActivityEntry, Reconciliation } from '@/lib/types';
import { CURRENCIES, EXCHANGE_RATES } from '@/lib/mock-data';

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
  
  addAccount: (acc: any) => Promise<void>;
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  
  addCategory: (cat: any) => Promise<void>;
  updateCategory: (id: string, data: Partial<Category>) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
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
    let people: Record<string, Person> = {};
    if (currentWorkspaceId) {
      const { data: peopleData } = await supabase.rpc('list_workspace_people', { ws: currentWorkspaceId });
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

    const budgetsRes = await withWs(
      supabase
        .from('budgets')
        .select('*, budget_categories(category_id, limit_amount)')
        .is('deleted_at', null)
        .order('created_at', { ascending: true }) as any
    );
    let accounts = (walletsRes.data || []).map((w: any) => ({
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
        account_id: t.wallet_id,
        destination_account_id: t.related_transaction_id ? t.related_transaction_id : null,
        description: t.description,
        date: t.date,
        period_month: t.period_month,
        invoiced_at: t.invoiced_at,
        import_batch: t.import_batch,
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

    await get().hydrate();
    const row = Array.isArray(data) ? data[0] : data;
    return {
      ...row,
      counted_amount: Number(row.counted_amount),
      expected_amount: Number(row.expected_amount),
    } as Reconciliation;
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

        const { data: tx, error: txError } = await supabase
          .from('transactions')
          .insert({
            user_id: appUserId,
            workspace_id: currentWorkspaceId,
            wallet_id: rec.wallet_id,
            category_id: categoryId,
            type,
            amount: Math.abs(diff),
            currency_code: (wallet.currency_id || 'ars').toUpperCase(),
            description: `Ajuste por arqueo del ${new Date(rec.counted_at).toLocaleDateString('es-AR')}`,
            date: rec.counted_at,
            is_checkpoint: false,
            status: 'reviewed',
          })
          .select('id')
          .single();
        if (txError) throw txError;
        adjustmentId = tx.id;
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

    await get().hydrate();
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
      isHydrated: true,
    });
  },

  // === TRANSACTIONS ===
  addTransaction: async (tx) => {
    const state = get();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) throw new Error("Usuario no encontrado en la BD. auth_id: " + state.user?.id);

    const payload = {
       user_id: userData.id,
       ...wsPatch(state.currentWorkspaceId),
       wallet_id: tx.account_id,
       category_id: tx.category_id || null,
       type: tx.type,
       amount: tx.amount,
       currency_code: tx.currency_id.toUpperCase(),
       description: tx.description,
       date: tx.date || new Date().toISOString(),
       period_month: tx.period_month || null,
       invoiced_at: tx.invoiced_at || null
    };

    const { data, error } = await supabase.from('transactions').insert(payload).select().single();

    if (error) console.error("Error creating tx:", error);

    if (tx.type === 'transfer' && tx.destination_account_id && data) {
       await supabase.from('transactions').insert({
           user_id: userData.id,
           ...wsPatch(state.currentWorkspaceId),
           wallet_id: tx.destination_account_id,
           type: 'transfer',
           amount: -Math.abs(tx.amount),
           currency_code: tx.currency_id.toUpperCase(),
          description: `Transferencia entrante: ${tx.description}`,
          date: tx.date || new Date().toISOString(),
          related_transaction_id: data.id
       });
    }

    await get().hydrate();
  },
  removeTransaction: async (id) => {
    const { error } = await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      console.error('Delete Error:', error);
      throw error;
    }
    await get().hydrate();
  },
  revertImportBatch: async (batchId) => {
    const { error } = await supabase
      .from('transactions')
      .update({ deleted_at: nowIso() })
      .eq('import_batch', batchId)
      .is('deleted_at', null);
    if (error) {
       console.error("Revert Error:", error);
       throw error;
    }
    await get().hydrate();
  },
  updateTransaction: async (id, data) => {
    const state = get();
    // Validate destination existence if it's a transfer
    const updatePayload: any = {};
    if (data.type) updatePayload.type = data.type;
    if (data.amount) updatePayload.amount = data.amount;
    if (data.currency_id) updatePayload.currency_code = data.currency_id.toUpperCase();
    if (data.category_id !== undefined) updatePayload.category_id = data.category_id;
    if (data.account_id) updatePayload.wallet_id = data.account_id;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.date) updatePayload.date = data.date;
    if (data.period_month !== undefined) updatePayload.period_month = data.period_month;

    const { error } = await supabase.from('transactions').update(updatePayload).eq('id', id);
    if (error) {
      console.error("Error updating tx:", error);
      throw error;
    }
    
    // Simplification for MVP: If they changed transfer logic, we'd need to sync related_transaction_id.
    // But basic updates on date, amount, description run safely.
    
    await get().hydrate();
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

  // === ACCOUNTS ===
  addAccount: async (acc) => {
    const state = get();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) throw new Error("Usario público no encontrado. auth_id: " + state.user?.id);

    const { error } = await supabase.from('wallets').insert({
       user_id: userData.id,
       ...wsPatch(state.currentWorkspaceId),
       name: acc.name,
       type: acc.type,
       initial_balance: acc.initial_balance || 0,
       currency_code: acc.currency_id.toUpperCase()
    });
    if (error) {
      console.error("SUPABASE WALLET INSERT ERROR:", error);
      throw error;
    }
    await get().hydrate();
  },
  updateAccount: async (id, data) => {
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.type) updateData.type = data.type;
    if (data.currency_id) updateData.currency_code = data.currency_id.toUpperCase();
    if (data.initial_balance !== undefined) updateData.initial_balance = data.initial_balance;
    
    const { error } = await supabase.from('wallets').update(updateData).eq('id', id);
    if (error) throw error;
    await get().hydrate();
  },
  removeAccount: async (id) => {
    const { error } = await supabase.from('wallets').update({ deleted_at: nowIso() }).eq('id', id);
    if (error) throw error;
    await get().hydrate();
  },

  // === CATEGORIES ===
  addCategory: async (cat) => {
    const state = get();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) return;

    // Optimistic UI
    const tempId = 'temp-' + Date.now();
    set(s => ({
      categories: [...s.categories, {
        id: tempId,
        name: cat.name,
        type: cat.type,
        group_id: undefined,
        group_name: cat.group_name,
        color: '#6366f1',
        icon: 'folder',
        is_default: false,
        is_recurring: cat.is_recurring || false,
        created_at: new Date().toISOString()
      }]
    }));

    let groupId = null;
    const groupNameStr = cat.group_name || 'General';
    const group = get().categoryGroups.find((g: any) => g.name === groupNameStr);
    
    if (group) {
        groupId = group.id;
    } else {
        const { data: newGroup } = await supabase.from('category_groups')
            .insert({ name: groupNameStr, user_id: userData.id, is_system: false, ...wsPatch(state.currentWorkspaceId) })
            .select()
            .single();
        if (newGroup) groupId = newGroup.id;
    }

    const { error } = await supabase.from('categories').insert({
       user_id: userData.id,
       ...wsPatch(state.currentWorkspaceId),
       name: cat.name,
       type: cat.type,
       group_name: groupNameStr,
       group_id: groupId,
       is_recurring: cat.is_recurring || false
    });
    
    if (error) {
       console.error("Error adding category:", error);
       // Revert
       set(s => ({ categories: s.categories.filter(c => c.id !== tempId) }));
    }
    await get().hydrate();
  },
  updateCategory: async (id, data) => {
    // Optimistic UI
    const prevCategories = get().categories;
    set(s => ({
       categories: s.categories.map(c => c.id === id ? { ...c, ...data } : c)
    }));

    let groupId = null;
    if (data.group_name) {
        const group = get().categoryGroups.find((g: any) => g.name === data.group_name);
        if (group) {
            groupId = group.id;
        } else {
            const userData = get().user;
            if (userData) {
                const { data: newGroup } = await supabase.from('category_groups')
                    .insert({ name: data.group_name, user_id: userData.id, is_system: false, ...wsPatch(get().currentWorkspaceId) })
                    .select()
                    .single();
                if (newGroup) groupId = newGroup.id;
            }
        }
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.type) updateData.type = data.type;
    if (data.group_name) {
       updateData.group_name = data.group_name;
       if (groupId) updateData.group_id = groupId;
    }
    if (data.is_recurring !== undefined) updateData.is_recurring = data.is_recurring;
    
    const { error } = await supabase.from('categories').update(updateData).eq('id', id);
    if (error) {
       console.error("Error updating category:", error);
       set({ categories: prevCategories });
       throw error;
    }
    // Fire and forget refetch for long term consistency
    get().hydrate();
  },
  removeCategory: async (id) => {
    // Optimistic UI
    const prevCategories = get().categories;
    set(s => ({ categories: s.categories.filter(c => c.id !== id) }));
    
    const { error } = await supabase.from('categories').update({ deleted_at: nowIso() }).eq('id', id);
    if (error) {
       console.error("Error removing category:", error);
       set({ categories: prevCategories });
    }
    // hydrate later
    get().hydrate();
  },
  removeCategoryAndTransfer: async (oldId: string, newId: string) => {
    // Update transactions
    await supabase.from('transactions').update({ category_id: newId }).eq('category_id', oldId);
    // Update debts
    await supabase.from('debts').update({ category_id: newId }).eq('category_id', oldId);
    // Delete old category
    await supabase.from('categories').update({ deleted_at: nowIso() }).eq('id', oldId);
    
    await get().hydrate();
  },
  renameCategoryGroup: async (oldName: string, newName: string) => {
    // We update both category_groups (if exists) and categories tables to keep them in sync
    await supabase.from('category_groups').update({ name: newName }).eq('name', oldName);
    await supabase.from('categories').update({ group_name: newName }).eq('group_name', oldName);
    await get().hydrate();
  },

  // === BUDGETS (Local/Stub for now) ===
  // Antes esto vivía sólo en memoria con Date.now() como id y se perdía al
  // recargar. Ahora persiste en budgets + budget_categories.
  addBudget: async (budget) => {
    const { appUserId, currentWorkspaceId } = get();
    if (!appUserId || !currentWorkspaceId) throw new Error('No hay un espacio activo.');

    const { data: created, error } = await supabase
      .from('budgets')
      .insert({
        user_id: appUserId,
        workspace_id: currentWorkspaceId,
        name: budget.name,
        period: budget.period,
        currency_code: (budget.currency_id || 'ars').toUpperCase(),
      })
      .select()
      .single();
    if (error) throw error;

    const lines = (budget.categories || []).filter((c) => c.category_id);
    if (lines.length) {
      const { error: lineError } = await supabase.from('budget_categories').insert(
        lines.map((c) => ({
          budget_id: created.id,
          category_id: c.category_id,
          limit_amount: c.limit_amount,
        }))
      );
      // Sin líneas el presupuesto no significa nada: se deshace para no dejar
      // un registro a medias.
      if (lineError) {
        // No es un borrado del usuario: se deshace algo que acaba de fallar.
        await supabase.from('budgets').delete().eq('id', created.id);
        throw lineError;
      }
    }

    await get().hydrate();
  },

  updateBudget: async (id, data) => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.period !== undefined) patch.period = data.period;
    if (data.currency_id !== undefined) patch.currency_code = data.currency_id.toUpperCase();

    if (Object.keys(patch).length) {
      const { error } = await supabase.from('budgets').update(patch).eq('id', id);
      if (error) throw error;
    }

    if (data.categories) {
      // Reemplazo completo: es más simple y predecible que diferenciar altas,
      // bajas y cambios de una lista corta.
      // Tampoco es un borrado del usuario: se reemplazan las líneas hijas del
      // presupuesto, que no tienen identidad propia fuera de él.
      const { error: delError } = await supabase.from('budget_categories').delete().eq('budget_id', id);
      if (delError) throw delError;

      const lines = data.categories.filter((c) => c.category_id);
      if (lines.length) {
        const { error: insError } = await supabase.from('budget_categories').insert(
          lines.map((c) => ({ budget_id: id, category_id: c.category_id, limit_amount: c.limit_amount }))
        );
        if (insError) throw insError;
      }
    }

    await get().hydrate();
  },

  removeBudget: async (id) => {
    // budget_categories cae por ON DELETE CASCADE.
    const { error } = await supabase.from('budgets').update({ deleted_at: nowIso() }).eq('id', id);
    if (error) throw error;
    set((state) => ({ budgets: state.budgets.filter((b) => b.id !== id) }));
  },

  setPrimaryCurrency: (id) => set({ primaryCurrencyId: id }),
}));
