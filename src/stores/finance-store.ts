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
  user: any | null; // Supabase user

  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  
  addTransaction: (tx: any) => Promise<void>;
  addAccount: (acc: any) => Promise<void>;
  addCategory: (cat: any) => Promise<void>;
  
  setPrimaryCurrency: (id: string) => void;
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  currencies: CURRENCIES, // Static for now
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  exchangeRates: EXCHANGE_RATES, // Static for now
  primaryCurrencyId: 'ars',
  isHydrated: false,
  user: null,

  hydrate: async () => {
    // 1. Check Session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      set({ isHydrated: true, user: null, accounts: [], categories: [], transactions: [] });
      return;
    }

    set({ user: session.user });

    // 2. Fetch Data
    const [walletsRes, categoriesRes, txRes] = await Promise.all([
      supabase.from('wallets').select('*').order('created_at', { ascending: true }),
      supabase.from('categories').select('*').order('created_at', { ascending: true }),
      supabase.from('transactions').select('*').order('date', { ascending: false }),
    ]);

    // Compute Account Balances locally based on transactions (since Wallets table doesn't store balance)
    const txs = txRes.data || [];
    let accounts = (walletsRes.data || []).map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      currency_id: w.currency_code.toLowerCase(),
      balance: 0,
    }));

    // Reconstruct balances
    for (const tx of txs) {
      const acc = accounts.find((a) => a.id === tx.wallet_id);
      if (acc) {
        if (tx.type === 'income') acc.balance += Number(tx.amount);
        if (tx.type === 'expense') acc.balance -= Number(tx.amount);
        if (tx.type === 'transfer' || tx.type === 'exchange') acc.balance -= Number(tx.amount);
      }
      if (tx.type === 'transfer' && tx.related_transaction_id) {
        // Technically double-entry will handle the other leg independently if modeled as incoming tx 
        // We'll trust the DB records. If the other leg is recorded as 'income', it will be processed.
      }
    }

    set({
      accounts,
      categories: (categoriesRes.data || []).map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        color: '#6366f1', // Default color, as our DB doesn't have it yet
        icon: 'folder'
      })),
      transactions: txs.map(t => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        currency_id: t.currency_code.toLowerCase(),
        category_id: t.category_id,
        account_id: t.wallet_id,
        description: t.description,
        date: t.date,
        destination_account_id: null, // For simplicity unless queried via related_transaction_id
      })),
      isHydrated: true,
    });
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Si no existe, lo creamos para que el entorno de desarrollo sea fluido
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

  addTransaction: async (tx) => {
    const state = get();
    // 1. Get user_id from DB user table related to auth
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) return;

    // Normal Transaction
    const { data, error } = await supabase.from('transactions').insert({
      user_id: userData.id,
      wallet_id: tx.account_id,
      category_id: tx.category_id || null,
      type: tx.type,
      amount: tx.amount,
      currency_code: tx.currency_id.toUpperCase(),
      description: tx.description,
      date: tx.date || new Date().toISOString(),
    }).select().single();

    if (error) console.error("Error creating tx:", error);

    // If transfer, handle leg 2 (Double entry)
    if (tx.type === 'transfer' && tx.destination_account_id && data) {
       await supabase.from('transactions').insert({
          user_id: userData.id,
          wallet_id: tx.destination_account_id,
          type: 'transfer',
          amount: tx.amount, // Or converted amount
          currency_code: tx.currency_id.toUpperCase(),
          description: `Transferencia entrante: ${tx.description}`,
          date: tx.date || new Date().toISOString(),
          related_transaction_id: data.id
       });
    }

    await get().hydrate(); // Reload everything cleanly
  },

  addAccount: async (acc) => {
    const state = get();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) return;

    await supabase.from('wallets').insert({
       user_id: userData.id,
       name: acc.name,
       type: acc.type,
       currency_code: acc.currency_id.toUpperCase()
    });
    await get().hydrate();
  },

  addCategory: async (cat) => {
    const state = get();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) return;

    await supabase.from('categories').insert({
       user_id: userData.id,
       name: cat.name,
       type: cat.type
    });
    await get().hydrate();
  },

  setPrimaryCurrency: (id) => set({ primaryCurrencyId: id }),
}));
