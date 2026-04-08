-- ==============================================================================
-- 002: Finance Core (Wallets, Categories, Transactions)
-- ==============================================================================

-- 1. ENUMS
CREATE TYPE wallet_type AS ENUM ('cash', 'bank', 'digital');
CREATE TYPE category_type AS ENUM ('income', 'expense');
CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer', 'exchange');

-- ==========================================
-- TABLE: wallets
-- ==========================================
CREATE TABLE public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type wallet_type NOT NULL DEFAULT 'cash',
    currency_code TEXT NOT NULL DEFAULT 'ARS',
    bank_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "USERS SELECT OWN_WALLETS" ON public.wallets
    FOR SELECT TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "USERS INSERT OWN_WALLETS" ON public.wallets
    FOR INSERT TO public
    WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "USERS UPDATE OWN_WALLETS" ON public.wallets
    FOR UPDATE TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE TRIGGER set_updated_at_wallets
    BEFORE UPDATE ON public.wallets
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================
-- TABLE: categories
-- ==========================================
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type category_type NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "USERS SELECT OWN_CATEGORIES" ON public.categories
    FOR SELECT TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "USERS INSERT OWN_CATEGORIES" ON public.categories
    FOR INSERT TO public
    WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "USERS UPDATE OWN_CATEGORIES" ON public.categories
    FOR UPDATE TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE TRIGGER set_updated_at_categories
    BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================
-- TABLE: transactions
-- ==========================================
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    type transaction_type NOT NULL,
    
    -- Multicurrency Pattern
    amount NUMERIC(15, 2) NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'ARS',
    exchange_rate NUMERIC(12, 6) DEFAULT 1,
    
    description TEXT,
    date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- For double-entry (transfers & exchanges)
    related_transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "USERS SELECT OWN_TRANSACTIONS" ON public.transactions
    FOR SELECT TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "USERS INSERT OWN_TRANSACTIONS" ON public.transactions
    FOR INSERT TO public
    WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "USERS UPDATE OWN_TRANSACTIONS" ON public.transactions
    FOR UPDATE TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE TRIGGER set_updated_at_transactions
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
