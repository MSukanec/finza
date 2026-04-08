-- ==========================================
-- Migration 008: Delete Policies
-- ==========================================

-- Agregar permisos de HARD DELETE a las tablas principales
CREATE POLICY "USERS DELETE OWN_WALLETS" ON public.wallets
    FOR DELETE TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "USERS DELETE OWN_CATEGORIES" ON public.categories
    FOR DELETE TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "USERS DELETE OWN_TRANSACTIONS" ON public.transactions
    FOR DELETE TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));
