-- ============================================
-- FINZA — Row Level Security Policies
-- ============================================
-- All tables enforce user isolation via users.id (never auth_id as FK).

-- Helper function to resolve current user's internal ID
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ===== USERS =====
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  USING (auth_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth_id = auth.uid());

-- ===== ACCOUNTS =====
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own accounts"
  ON public.accounts FOR ALL
  USING (user_id = public.get_current_user_id());

-- ===== CATEGORIES =====
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own categories"
  ON public.categories FOR ALL
  USING (user_id = public.get_current_user_id());

-- ===== TRANSACTIONS =====
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own transactions"
  ON public.transactions FOR ALL
  USING (user_id = public.get_current_user_id());

-- ===== BUDGETS =====
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own budgets"
  ON public.budgets FOR ALL
  USING (user_id = public.get_current_user_id());

-- ===== BUDGET CATEGORIES =====
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own budget categories"
  ON public.budget_categories FOR ALL
  USING (
    budget_id IN (
      SELECT id FROM public.budgets WHERE user_id = public.get_current_user_id()
    )
  );
