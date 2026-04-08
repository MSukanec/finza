-- ==============================================================================
-- 003: Fix Users RLS Infinite Loop
-- ==============================================================================
-- Explicación:
-- La política original contenía un subquery que apuntaba a su misma tabla: 
-- "OR id = (SELECT id FROM public.users...)"
-- Al evaluar "SELECT FROM public.users" Postgres dispara "USERS SELECT OWN_USER_DATA" 
-- infinitas veces hasta cortar el loop y retornar 0 resultados. 
-- Esto "silenciaba" todas las queries a usuarios, trabando la creación de wallets.

BEGIN;

DROP POLICY IF EXISTS "USERS SELECT OWN_USER_DATA" ON public.users;
CREATE POLICY "USERS SELECT OWN_USER_DATA" ON public.users
    FOR SELECT TO public
    USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "USERS UPDATE OWN_USER_DATA" ON public.users;
CREATE POLICY "USERS UPDATE OWN_USER_DATA" ON public.users
    FOR UPDATE TO public
    USING (auth_id = auth.uid());

COMMIT;
