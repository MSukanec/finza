-- 034 · Rol colaborador: alguien que sólo ve lo que él mismo cargó
--
-- Hasta acá "miembro" significaba "ve absolutamente todo": las doce tablas
-- tenían la misma regla, `is_workspace_member`. Eso alcanza entre socios, pero
-- no para la persona que atiende el local y carga la caja: ella tiene que poder
-- registrar ingresos y egresos, y no tiene por qué ver los aportes de los
-- socios, los porcentajes de participación, las deudas ni los arqueos.
--
-- El límite vive ACÁ y no en la interfaz. Esconder un menú no protege nada: la
-- persona tiene un token válido y puede consultar la base por fuera de la app.
-- Todo lo que sigue está escrito para que esa consulta no devuelva nada.
--
-- Los tres roles, con el nombre que usa la pantalla entre paréntesis:
--   owner        (Administrador) — todo, más invitar y configurar
--   member       (Miembro)       — ve y edita todo, no invita
--   collaborator (Colaborador)   — sólo sus propios movimientos

-- ---------------------------------------------------------------- 1. El rol

ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_role_check
    CHECK (role = ANY (ARRAY['owner'::text, 'member'::text, 'collaborator'::text]));

ALTER TABLE public.workspace_invitations DROP CONSTRAINT IF EXISTS workspace_invitations_role_check;
ALTER TABLE public.workspace_invitations ADD CONSTRAINT workspace_invitations_role_check
    CHECK (role = ANY (ARRAY['owner'::text, 'member'::text, 'collaborator'::text]));

/** El rol del usuario actual en un espacio, o NULL si no es miembro. */
CREATE OR REPLACE FUNCTION public.workspace_role(ws uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT m.role
      FROM public.workspace_members m
      JOIN public.workspaces w ON w.id = m.workspace_id
     WHERE m.workspace_id = ws
       AND m.user_id = public.current_user_id()
       AND w.deleted_at IS NULL
$$;

/**
 * Si el usuario ve el espacio entero o sólo lo suyo.
 *
 * Es la pregunta que hace TODA la seguridad de acá abajo. Se escribe una vez y
 * se usa en todos lados a propósito: una regla repetida a mano en doce tablas
 * es una regla que en algún lado va a quedar desactualizada.
 */
CREATE OR REPLACE FUNCTION public.can_see_all(ws uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(public.workspace_role(ws) IN ('owner', 'member'), false)
$$;

REVOKE ALL ON FUNCTION public.workspace_role(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_see_all(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.workspace_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_all(uuid) TO authenticated;

-- ------------------------------------------------- 2. Movimientos: los propios

-- El colaborador ve, edita y borra ÚNICAMENTE lo que cargó él. El `user_id` en
-- el WITH CHECK del update es lo que impide que se apropie de un movimiento
-- ajeno cambiándole el dueño, o que regale uno suyo.
DROP POLICY IF EXISTS transactions_select ON public.transactions;
CREATE POLICY transactions_select ON public.transactions
    FOR SELECT TO authenticated USING (
        public.is_workspace_member(workspace_id)
        AND (public.can_see_all(workspace_id) OR user_id = public.current_user_id())
    );

DROP POLICY IF EXISTS transactions_update ON public.transactions;
CREATE POLICY transactions_update ON public.transactions
    FOR UPDATE TO authenticated
    USING (
        public.is_workspace_member(workspace_id)
        AND (public.can_see_all(workspace_id) OR user_id = public.current_user_id())
    )
    WITH CHECK (
        public.is_workspace_member(workspace_id)
        AND (public.can_see_all(workspace_id) OR user_id = public.current_user_id())
    );

DROP POLICY IF EXISTS transactions_delete ON public.transactions;
CREATE POLICY transactions_delete ON public.transactions
    FOR DELETE TO authenticated USING (
        public.is_workspace_member(workspace_id)
        AND (public.can_see_all(workspace_id) OR user_id = public.current_user_id())
    );

-- El INSERT ya exigía `user_id = current_user_id()`, así que nadie puede cargar
-- un movimiento a nombre de otro. Se deja como está.

-- ------------------------------------------------- 3. Historial: lo propio

DROP POLICY IF EXISTS activity_log_select ON public.activity_log;
CREATE POLICY activity_log_select ON public.activity_log
    FOR SELECT TO authenticated USING (
        public.is_workspace_member(workspace_id)
        AND (public.can_see_all(workspace_id) OR user_id = public.current_user_id())
    );

-- ------------------------------------------------- 4. Billeteras

-- La fila de una billetera lleva `initial_balance` adentro. No hay forma de
-- esconder una columna con RLS, así que el colaborador no lee la tabla: para
-- elegir dónde entra la plata usa `billeteras_para_cargar`, que devuelve nombre
-- y moneda y ningún saldo.
DROP POLICY IF EXISTS wallets_select ON public.wallets;
CREATE POLICY wallets_select ON public.wallets
    FOR SELECT TO authenticated USING (public.can_see_all(workspace_id));

DROP POLICY IF EXISTS wallets_insert ON public.wallets;
CREATE POLICY wallets_insert ON public.wallets
    FOR INSERT TO authenticated
    WITH CHECK (public.can_see_all(workspace_id) AND user_id = public.current_user_id());

DROP POLICY IF EXISTS wallets_update ON public.wallets;
CREATE POLICY wallets_update ON public.wallets
    FOR UPDATE TO authenticated
    USING (public.can_see_all(workspace_id))
    WITH CHECK (public.can_see_all(workspace_id));

DROP POLICY IF EXISTS wallets_delete ON public.wallets;
CREATE POLICY wallets_delete ON public.wallets
    FOR DELETE TO authenticated USING (public.can_see_all(workspace_id));

/** Las billeteras del espacio, sin saldos: sólo lo necesario para cargar. */
CREATE OR REPLACE FUNCTION public.billeteras_para_cargar(ws uuid)
RETURNS TABLE (id uuid, name text, type text, currency_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_workspace_member(ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;

    RETURN QUERY
        SELECT w.id, w.name, w.type::text, w.currency_code
          FROM public.wallets w
         WHERE w.workspace_id = ws AND w.deleted_at IS NULL
         ORDER BY w.name;
END;
$$;

REVOKE ALL ON FUNCTION public.billeteras_para_cargar(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.billeteras_para_cargar(uuid) TO authenticated;

-- ------------------------------------------------- 5. Lo que no ve nunca

-- Socios, arqueos, deudas, presupuestos, importaciones y vaciados: nada de esto
-- hace falta para cargar un movimiento, y todo dice cosas del negocio que no le
-- corresponden a quien sólo atiende la caja.

DROP POLICY IF EXISTS partners_select ON public.partners;
CREATE POLICY partners_select ON public.partners
    FOR SELECT TO authenticated USING (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS partners_insert ON public.partners;
CREATE POLICY partners_insert ON public.partners
    FOR INSERT TO authenticated WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS partners_update ON public.partners;
CREATE POLICY partners_update ON public.partners
    FOR UPDATE TO authenticated
    USING (public.can_see_all(workspace_id)) WITH CHECK (public.can_see_all(workspace_id));

DROP POLICY IF EXISTS budgets_select ON public.budgets;
CREATE POLICY budgets_select ON public.budgets
    FOR SELECT TO authenticated USING (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS budgets_insert ON public.budgets;
CREATE POLICY budgets_insert ON public.budgets
    FOR INSERT TO authenticated WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS budgets_update ON public.budgets;
CREATE POLICY budgets_update ON public.budgets
    FOR UPDATE TO authenticated
    USING (public.can_see_all(workspace_id)) WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS budgets_delete ON public.budgets;
CREATE POLICY budgets_delete ON public.budgets
    FOR DELETE TO authenticated USING (public.can_see_all(workspace_id));

DROP POLICY IF EXISTS budget_categories_all ON public.budget_categories;
CREATE POLICY budget_categories_all ON public.budget_categories
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.budgets b
                    WHERE b.id = budget_categories.budget_id AND public.can_see_all(b.workspace_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.budgets b
                    WHERE b.id = budget_categories.budget_id AND public.can_see_all(b.workspace_id)));

DROP POLICY IF EXISTS debts_select ON public.debts;
CREATE POLICY debts_select ON public.debts
    FOR SELECT TO authenticated USING (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS debts_insert ON public.debts;
CREATE POLICY debts_insert ON public.debts
    FOR INSERT TO authenticated WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS debts_update ON public.debts;
CREATE POLICY debts_update ON public.debts
    FOR UPDATE TO authenticated
    USING (public.can_see_all(workspace_id)) WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS debts_delete ON public.debts;
CREATE POLICY debts_delete ON public.debts
    FOR DELETE TO authenticated USING (public.can_see_all(workspace_id));

DROP POLICY IF EXISTS purges_select ON public.purges;
CREATE POLICY purges_select ON public.purges
    FOR SELECT TO authenticated USING (public.can_see_all(workspace_id));

DROP POLICY IF EXISTS import_batches_select ON public.import_batches;
CREATE POLICY import_batches_select ON public.import_batches
    FOR SELECT TO authenticated USING (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS import_batches_insert ON public.import_batches;
CREATE POLICY import_batches_insert ON public.import_batches
    FOR INSERT TO authenticated WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS import_batches_update ON public.import_batches;
CREATE POLICY import_batches_update ON public.import_batches
    FOR UPDATE TO authenticated
    USING (public.can_see_all(workspace_id)) WITH CHECK (public.can_see_all(workspace_id));

DROP POLICY IF EXISTS import_rules_select ON public.import_rules;
CREATE POLICY import_rules_select ON public.import_rules
    FOR SELECT TO authenticated USING (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS import_rules_insert ON public.import_rules;
CREATE POLICY import_rules_insert ON public.import_rules
    FOR INSERT TO authenticated WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS import_rules_update ON public.import_rules;
CREATE POLICY import_rules_update ON public.import_rules
    FOR UPDATE TO authenticated
    USING (public.can_see_all(workspace_id)) WITH CHECK (public.can_see_all(workspace_id));

-- Los arqueos dicen cuánta plata hay de verdad en cada billetera.
DROP POLICY IF EXISTS reconciliations_select ON public.wallet_reconciliations;
DROP POLICY IF EXISTS wallet_reconciliations_select ON public.wallet_reconciliations;
CREATE POLICY wallet_reconciliations_select ON public.wallet_reconciliations
    FOR SELECT TO authenticated USING (public.can_see_all(workspace_id));

-- ------------------------------------------------- 6. Categorías: sí las ve

-- Sin categorías no puede clasificar lo que carga, y un nombre de categoría no
-- dice nada del dinero. Las lee; crearlas y editarlas, no.
DROP POLICY IF EXISTS categories_insert ON public.categories;
CREATE POLICY categories_insert ON public.categories
    FOR INSERT TO authenticated WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS categories_update ON public.categories;
CREATE POLICY categories_update ON public.categories
    FOR UPDATE TO authenticated
    USING (public.can_see_all(workspace_id)) WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS categories_delete ON public.categories;
CREATE POLICY categories_delete ON public.categories
    FOR DELETE TO authenticated USING (public.can_see_all(workspace_id));

DROP POLICY IF EXISTS category_groups_insert ON public.category_groups;
CREATE POLICY category_groups_insert ON public.category_groups
    FOR INSERT TO authenticated WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS category_groups_update ON public.category_groups;
CREATE POLICY category_groups_update ON public.category_groups
    FOR UPDATE TO authenticated
    USING (public.can_see_all(workspace_id)) WITH CHECK (public.can_see_all(workspace_id));
DROP POLICY IF EXISTS category_groups_delete ON public.category_groups;
CREATE POLICY category_groups_delete ON public.category_groups
    FOR DELETE TO authenticated USING (public.can_see_all(workspace_id));

-- ------------------------------------------------- 7. Quiénes son los demás

-- El colaborador ve su propia membresía —la app la necesita para saber su
-- rol— y ninguna otra. Quiénes más entran al espacio no es asunto suyo.
DROP POLICY IF EXISTS members_select ON public.workspace_members;
CREATE POLICY members_select ON public.workspace_members
    FOR SELECT TO authenticated USING (
        user_id = public.current_user_id() OR public.can_see_all(workspace_id)
    );
