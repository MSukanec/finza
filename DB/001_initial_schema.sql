-- ============================================
-- FINZA — Initial Schema
-- ============================================
-- Run this in Supabase SQL Editor when ready to connect to a real backend.

-- 1. Users (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  primary_currency_id TEXT DEFAULT 'ars',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Accounts (Wallets)
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'savings', 'credit', 'investment')),
  currency_id TEXT NOT NULL DEFAULT 'ars',
  balance NUMERIC(15,2) DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'Wallet',
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT DEFAULT 'DollarSign',
  color TEXT DEFAULT '#6b7280',
  is_default BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  currency_id TEXT NOT NULL DEFAULT 'ars',
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  destination_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  description TEXT DEFAULT '',
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Budgets
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('monthly', 'weekly')),
  currency_id TEXT NOT NULL DEFAULT 'ars',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Budget Categories (junction table)
CREATE TABLE IF NOT EXISTS public.budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  limit_amount NUMERIC(15,2) NOT NULL CHECK (limit_amount >= 0),
  UNIQUE (budget_id, category_id)
);

-- Indexes
CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX idx_transactions_user_type ON public.transactions(user_id, type);
CREATE INDEX idx_accounts_user ON public.accounts(user_id);
CREATE INDEX idx_categories_user ON public.categories(user_id);
CREATE INDEX idx_budgets_user ON public.budgets(user_id);
