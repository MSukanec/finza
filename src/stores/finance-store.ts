import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { Account, Category, Transaction, Budget, Currency } from '@/lib/types';
import { CURRENCIES, EXCHANGE_RATES } from '@/lib/mock-data';

interface FinanceState {
  currencies: Currency[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  exchangeRates: Record<string, number>;

  primaryCurrencyId: string;
  isHydrated: boolean;
  user: any | null; 

  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  
  addTransaction: (tx: any) => Promise<void>;
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  revertImportBatch: (batchId: string) => Promise<void>;
  
  addAccount: (acc: any) => Promise<void>;
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  
  addCategory: (cat: any) => Promise<void>;
  updateCategory: (id: string, data: Partial<Category>) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  
  addBudget: (budget: Omit<Budget, 'id' | 'created_at'>) => Promise<void>;
  updateBudget: (id: string, data: Partial<Budget>) => Promise<void>;
  removeBudget: (id: string) => Promise<void>;
  
  setPrimaryCurrency: (id: string) => void;
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  currencies: CURRENCIES,
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  exchangeRates: EXCHANGE_RATES,
  primaryCurrencyId: 'ars',
  isHydrated: false,
  user: null,

  hydrate: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      set({ isHydrated: true, user: null, accounts: [], categories: [], transactions: [] });
      return;
    }

    set({ user: session.user });

    const [walletsRes, categoriesRes, txRes] = await Promise.all([
      supabase.from('wallets').select('*').order('created_at', { ascending: true }),
      supabase.from('categories').select('*').order('created_at', { ascending: true }),
      supabase.from('transactions').select('*').order('date', { ascending: false }),
    ]);

    const txs = txRes.data || [];
    let accounts = (walletsRes.data || []).map((w: any) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      currency_id: w.currency_code.toLowerCase(),
      balance: 0,
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

    set({
      accounts,
      categories: (categoriesRes.data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        group_name: c.group_name || 'General',
        color: '#6366f1',
        icon: 'folder',
        is_default: false,
        created_at: c.created_at
      })),
      transactions: txs.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        currency_id: t.currency_code.toLowerCase(),
        category_id: t.category_id,
        account_id: t.wallet_id,
        destination_account_id: t.destination_account_id,
        description: t.description,
        date: t.date,
        invoiced_at: t.invoiced_at,
        created_at: t.created_at
      })),
      isHydrated: true,
    });
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: 'Test User' } } });
      if (signUpError) throw signUpError;
      set({ user: signUpData.user });
    } else {
      set({ user: data.user });
    }
    await get().hydrate();
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, accounts: [], categories: [], transactions: [] });
  },

  // === TRANSACTIONS ===
  addTransaction: async (tx) => {
    const state = get();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) throw new Error("Usuario no encontrado en la BD. auth_id: " + state.user?.id);

    const payload = {
       user_id: userData.id,
       wallet_id: tx.account_id,
       category_id: tx.category_id || null,
       type: tx.type,
       amount: tx.amount,
       currency_code: tx.currency_id.toUpperCase(),
       description: tx.description,
       date: tx.date || new Date().toISOString(),
       invoiced_at: tx.invoiced_at || null
    };

    const { data, error } = await supabase.from('transactions').insert(payload).select().single();

    if (error) console.error("Error creating tx:", error);

    if (tx.type === 'transfer' && tx.destination_account_id && data) {
       await supabase.from('transactions').insert({
           user_id: userData.id,
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
    await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await get().hydrate();
  },
  revertImportBatch: async (batchId) => {
    await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('import_batch', batchId);
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

    const { error } = await supabase.from('transactions').update(updatePayload).eq('id', id);
    if (error) {
      console.error("Error updating tx:", error);
      throw error;
    }
    
    // Simplification for MVP: If they changed transfer logic, we'd need to sync related_transaction_id.
    // But basic updates on date, amount, description run safely.
    
    await get().hydrate();
  },

  // === ACCOUNTS ===
  addAccount: async (acc) => {
    const state = get();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) throw new Error("Usario público no encontrado. auth_id: " + state.user?.id);

    const { error } = await supabase.from('wallets').insert({
       user_id: userData.id,
       name: acc.name,
       type: acc.type,
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
    
    const { error } = await supabase.from('wallets').update(updateData).eq('id', id);
    if (error) throw error;
    await get().hydrate();
  },
  removeAccount: async (id) => {
    await supabase.from('wallets').delete().eq('id', id);
    await get().hydrate();
  },

  // === CATEGORIES ===
  addCategory: async (cat) => {
    const state = get();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) return;

    await supabase.from('categories').insert({
       user_id: userData.id,
       name: cat.name,
       type: cat.type,
       group_name: cat.group_name
    });
    await get().hydrate();
  },
  updateCategory: async (id, data) => {
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.type) updateData.type = data.type;
    if (data.group_name) updateData.group_name = data.group_name;
    
    const { error } = await supabase.from('categories').update(updateData).eq('id', id);
    if (error) throw error;
    await get().hydrate();
  },
  removeCategory: async (id) => {
    await supabase.from('categories').delete().eq('id', id);
    await get().hydrate();
  },

  // === BUDGETS (Local/Stub for now) ===
  addBudget: async (budget) => {
    set((state) => ({ budgets: [...state.budgets, { ...budget, id: Date.now().toString(), created_at: new Date().toISOString() } as Budget] }));
  },
  updateBudget: async (id, data) => {},
  removeBudget: async (id) => {
    set((state) => ({ budgets: state.budgets.filter(b => b.id !== id) }));
  },

  setPrimaryCurrency: (id) => set({ primaryCurrencyId: id }),
}));
