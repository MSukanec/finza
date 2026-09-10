-- ==============================================================================
-- 012: Workspaces ("Espacios") — multiple isolated data sets per user
-- ==============================================================================
-- Permite tener varios "espacios" (real, pruebas, etc.) bajo el mismo login.
-- Como todos los espacios pertenecen al MISMO usuario, la seguridad la sigue
-- dando el RLS por user_id; el workspace_id es solo para separar/filtrar datos.
-- Correr este archivo completo en el SQL Editor de Supabase.
-- ==============================================================================

BEGIN;

-- 1. Tabla de espacios ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own workspaces" ON public.workspaces;
CREATE POLICY "Users manage own workspaces" ON public.workspaces
    FOR ALL TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()))
    WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at_workspaces ON public.workspaces;
CREATE TRIGGER set_updated_at_workspaces
    BEFORE UPDATE ON public.workspaces
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Columna workspace_id en las tablas de datos ----------------------------
--    (nullable: los grupos de sistema de category_groups quedan con NULL y
--     se comparten en todos los espacios)
ALTER TABLE public.wallets         ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.categories      ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.transactions    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.category_groups ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.debts           ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_wallets_workspace         ON public.wallets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_categories_workspace      ON public.categories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_transactions_workspace    ON public.transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_category_groups_workspace ON public.category_groups(workspace_id);
CREATE INDEX IF NOT EXISTS idx_debts_workspace           ON public.debts(workspace_id);

-- 3. Backfill: un espacio "Principal" por usuario con todos sus datos --------
DO $$
DECLARE
    u RECORD;
    ws UUID;
BEGIN
    FOR u IN SELECT id FROM public.users LOOP
        SELECT id INTO ws FROM public.workspaces WHERE user_id = u.id ORDER BY created_at LIMIT 1;
        IF ws IS NULL THEN
            INSERT INTO public.workspaces (user_id, name) VALUES (u.id, 'Principal') RETURNING id INTO ws;
        END IF;

        UPDATE public.wallets         SET workspace_id = ws WHERE user_id = u.id AND workspace_id IS NULL;
        UPDATE public.categories      SET workspace_id = ws WHERE user_id = u.id AND workspace_id IS NULL;
        UPDATE public.transactions    SET workspace_id = ws WHERE user_id = u.id AND workspace_id IS NULL;
        UPDATE public.category_groups SET workspace_id = ws WHERE user_id = u.id AND workspace_id IS NULL; -- solo grupos de usuario; los de sistema (user_id NULL) quedan NULL
        UPDATE public.debts           SET workspace_id = ws WHERE user_id = u.id AND workspace_id IS NULL;
    END LOOP;
END $$;

-- 4. Función para DUPLICAR un espacio (remapea todas las FK) -----------------
CREATE OR REPLACE FUNCTION public.clone_workspace(source_ws UUID, new_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_user UUID;
    v_new  UUID;
BEGIN
    SELECT id INTO v_user FROM public.users WHERE auth_id = auth.uid();
    IF v_user IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = source_ws AND user_id = v_user) THEN
        RAISE EXCEPTION 'Espacio de origen no encontrado';
    END IF;

    INSERT INTO public.workspaces (user_id, name) VALUES (v_user, new_name) RETURNING id INTO v_new;

    -- Mapas old_id -> new_id (uuid precomputado para remapear FKs con exactitud)
    CREATE TEMP TABLE _gmap ON COMMIT DROP AS
        SELECT id AS old_id, gen_random_uuid() AS new_id
        FROM public.category_groups WHERE workspace_id = source_ws;
    CREATE TEMP TABLE _cmap ON COMMIT DROP AS
        SELECT id AS old_id, gen_random_uuid() AS new_id
        FROM public.categories WHERE workspace_id = source_ws;
    CREATE TEMP TABLE _wmap ON COMMIT DROP AS
        SELECT id AS old_id, gen_random_uuid() AS new_id
        FROM public.wallets WHERE workspace_id = source_ws;
    CREATE TEMP TABLE _tmap ON COMMIT DROP AS
        SELECT id AS old_id, gen_random_uuid() AS new_id
        FROM public.transactions WHERE workspace_id = source_ws;

    -- Grupos de categoría propios del espacio (los de sistema se comparten, no se copian)
    INSERT INTO public.category_groups (id, user_id, name, is_system, workspace_id)
        SELECT m.new_id, g.user_id, g.name, g.is_system, v_new
        FROM public.category_groups g JOIN _gmap m ON m.old_id = g.id;

    -- Categorías (remapea group_id si era un grupo del espacio; si es de sistema lo mantiene)
    INSERT INTO public.categories (id, user_id, name, type, group_name, group_id, is_recurring, workspace_id)
        SELECT cm.new_id, c.user_id, c.name, c.type, c.group_name,
               COALESCE(gm.new_id, c.group_id), c.is_recurring, v_new
        FROM public.categories c
        JOIN _cmap cm ON cm.old_id = c.id
        LEFT JOIN _gmap gm ON gm.old_id = c.group_id;

    -- Billeteras
    INSERT INTO public.wallets (id, user_id, name, type, currency_code, bank_name, initial_balance, workspace_id)
        SELECT wm.new_id, w.user_id, w.name, w.type, w.currency_code, w.bank_name, w.initial_balance, v_new
        FROM public.wallets w JOIN _wmap wm ON wm.old_id = w.id;

    -- Movimientos (1ra pasada: related_transaction_id en NULL para no romper la FK auto-referenciada)
    INSERT INTO public.transactions
        (id, user_id, wallet_id, category_id, type, amount, currency_code, exchange_rate,
         description, date, related_transaction_id, invoiced_at, import_batch, deleted_at,
         is_checkpoint, period_month, workspace_id)
        SELECT tm.new_id, t.user_id, wm.new_id, cm.new_id, t.type, t.amount, t.currency_code, t.exchange_rate,
               t.description, t.date, NULL, t.invoiced_at, t.import_batch, t.deleted_at,
               t.is_checkpoint, t.period_month, v_new
        FROM public.transactions t
        JOIN _tmap tm ON tm.old_id = t.id
        LEFT JOIN _wmap wm ON wm.old_id = t.wallet_id
        LEFT JOIN _cmap cm ON cm.old_id = t.category_id;

    -- Movimientos (2da pasada: reconecta related_transaction_id a los nuevos ids)
    UPDATE public.transactions nt
        SET related_transaction_id = tmr.new_id
        FROM public.transactions ot
        JOIN _tmap tm  ON tm.old_id = ot.id
        JOIN _tmap tmr ON tmr.old_id = ot.related_transaction_id
        WHERE nt.id = tm.new_id AND ot.related_transaction_id IS NOT NULL;

    -- Deudas
    INSERT INTO public.debts (id, user_id, category_id, total_amount, currency_code, description, workspace_id)
        SELECT gen_random_uuid(), d.user_id, cm.new_id, d.total_amount, d.currency_code, d.description, v_new
        FROM public.debts d JOIN _cmap cm ON cm.old_id = d.category_id
        WHERE d.workspace_id = source_ws;

    RETURN v_new;
END $$;

GRANT EXECUTE ON FUNCTION public.clone_workspace(UUID, TEXT) TO authenticated;

COMMIT;
