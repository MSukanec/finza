-- 019_budgets.sql
-- ============================================================
-- Presupuestos reales. 2026-09-10.
--
-- Hasta ahora "Presupuestos" era una maqueta: vivían en memoria del store con
-- `Date.now()` como id y se perdían al recargar. No existía ninguna tabla.
--
-- Modelo: un presupuesto agrupa varios límites por categoría, para poder decir
-- "Costos de cocina = Comidas + Bebidas + Insumos, tope $X". Por eso son dos
-- tablas y no una columna suelta en categories.
--
-- Seguridad por membresía del espacio, igual que el resto (ver 015).
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.budgets (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name          text NOT NULL,
    period        text NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly','weekly')),
    currency_code text NOT NULL DEFAULT 'ARS',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.budget_categories (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id    uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
    category_id  uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    limit_amount numeric NOT NULL DEFAULT 0 CHECK (limit_amount >= 0),
    UNIQUE (budget_id, category_id)
);

CREATE INDEX IF NOT EXISTS budgets_workspace_idx ON public.budgets(workspace_id);
CREATE INDEX IF NOT EXISTS budget_categories_budget_idx ON public.budget_categories(budget_id);

DROP TRIGGER IF EXISTS set_updated_at_budgets ON public.budgets;
CREATE TRIGGER set_updated_at_budgets
    BEFORE UPDATE ON public.budgets
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.budgets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budgets_select ON public.budgets;
CREATE POLICY budgets_select ON public.budgets
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS budgets_insert ON public.budgets;
CREATE POLICY budgets_insert ON public.budgets
    FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id) AND user_id = public.current_user_id());

DROP POLICY IF EXISTS budgets_update ON public.budgets;
CREATE POLICY budgets_update ON public.budgets
    FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS budgets_delete ON public.budgets;
CREATE POLICY budgets_delete ON public.budgets
    FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));

-- Las líneas heredan el permiso de su presupuesto: no tienen workspace propio.
DROP POLICY IF EXISTS budget_categories_all ON public.budget_categories;
CREATE POLICY budget_categories_all ON public.budget_categories
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.budgets b
         WHERE b.id = budget_id AND public.is_workspace_member(b.workspace_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.budgets b
         WHERE b.id = budget_id AND public.is_workspace_member(b.workspace_id)
    ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_categories TO authenticated;
