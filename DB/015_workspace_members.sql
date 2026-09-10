-- 015_workspace_members.sql
-- ============================================================
-- Espacios compartidos entre varios usuarios. 2026-09-10.
--
-- Cambia el modelo de seguridad de "la fila es mia (user_id)" a
-- "soy miembro del espacio al que pertenece la fila (workspace_id)".
--
-- Esto ademas cierra un agujero real: hasta ahora `workspace_id` no aparecia
-- en NINGUNA politica RLS, o sea que la separacion entre espacios la hacia
-- solamente el cliente. A partir de aca la impone la base.
--
-- Roles: 'owner' (invita, expulsa, borra el espacio) y 'member' (todo lo demas).
-- Invitaciones por email: si el invitado ya tiene cuenta se lo agrega en el
-- acto; si no, queda pendiente y se activa sola cuando se registra con ese mail.
--
-- Idempotente. Correr con --tx.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Reparar datos antes de que las politicas dependan de workspace_id.
--    Una transaccion quedo con workspace_id NULL; hereda el espacio de su
--    billetera, que es inequivoco.
-- ------------------------------------------------------------
UPDATE public.transactions t
   SET workspace_id = w.workspace_id
  FROM public.wallets w
 WHERE t.wallet_id = w.id
   AND t.workspace_id IS NULL
   AND w.workspace_id IS NOT NULL;

-- ------------------------------------------------------------
-- 1. Tablas nuevas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
    role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS workspace_members_ws_idx   ON public.workspace_members(workspace_id);

CREATE TABLE IF NOT EXISTS public.workspace_invitations (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    email        text NOT NULL,
    role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
    invited_by   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    accepted_at  timestamptz,
    UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS workspace_invitations_email_idx ON public.workspace_invitations(lower(email));

-- ------------------------------------------------------------
-- 2. Backfill: el dueno actual de cada espacio pasa a ser miembro 'owner'
-- ------------------------------------------------------------
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, w.user_id, 'owner' FROM public.workspaces w
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Helpers.
--    SECURITY DEFINER a proposito: sin eso, las politicas de workspace_members
--    que consultan workspace_members entran en recursion infinita.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT id FROM public.users WHERE auth_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(ws uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.workspace_members m
        WHERE m.workspace_id = ws AND m.user_id = public.current_user_id()
    )
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(ws uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.workspace_members m
        WHERE m.workspace_id = ws AND m.user_id = public.current_user_id()
          AND m.role = 'owner'
    )
$$;

-- ------------------------------------------------------------
-- 4. Al crear un espacio, su creador queda como owner automaticamente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (NEW.id, NEW.user_id, 'owner')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created ON public.workspaces;
CREATE TRIGGER on_workspace_created
    AFTER INSERT ON public.workspaces
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace();

-- ------------------------------------------------------------
-- 5. Al registrarse, se activan las invitaciones pendientes para ese email
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
BEGIN
    INSERT INTO public.users (auth_id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
    RETURNING id INTO v_user;

    -- Invitaciones pendientes dirigidas a este email
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    SELECT i.workspace_id, v_user, i.role
      FROM public.workspace_invitations i
     WHERE lower(i.email) = lower(NEW.email) AND i.accepted_at IS NULL
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    UPDATE public.workspace_invitations
       SET accepted_at = now()
     WHERE lower(email) = lower(NEW.email) AND accepted_at IS NULL;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 6. RPC para invitar. Devuelve 'added' si ya tenia cuenta, 'invited' si queda
--    pendiente. Solo el owner del espacio puede invitar.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_to_workspace(ws uuid, invitee_email text, invitee_role text DEFAULT 'member')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_me     uuid := public.current_user_id();
    v_target uuid;
    v_email  text := lower(trim(invitee_email));
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'No hay sesion activa';
    END IF;
    IF NOT public.is_workspace_owner(ws) THEN
        RAISE EXCEPTION 'Solo el dueno del espacio puede invitar';
    END IF;
    IF invitee_role NOT IN ('owner','member') THEN
        RAISE EXCEPTION 'Rol invalido: %', invitee_role;
    END IF;
    IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
        RAISE EXCEPTION 'Email invalido';
    END IF;

    SELECT id INTO v_target FROM public.users WHERE lower(email) = v_email;

    IF v_target IS NOT NULL THEN
        INSERT INTO public.workspace_members (workspace_id, user_id, role)
        VALUES (ws, v_target, invitee_role)
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
        RETURN 'added';
    END IF;

    INSERT INTO public.workspace_invitations (workspace_id, email, role, invited_by)
    VALUES (ws, v_email, invitee_role, v_me)
    ON CONFLICT (workspace_id, email) DO UPDATE SET role = EXCLUDED.role, accepted_at = NULL;
    RETURN 'invited';
END;
$$;

-- ------------------------------------------------------------
-- 7. RLS de las tablas nuevas
-- ------------------------------------------------------------
ALTER TABLE public.workspace_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS members_select ON public.workspace_members;
CREATE POLICY members_select ON public.workspace_members
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS members_insert ON public.workspace_members;
CREATE POLICY members_insert ON public.workspace_members
    FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_owner(workspace_id));

DROP POLICY IF EXISTS members_update ON public.workspace_members;
CREATE POLICY members_update ON public.workspace_members
    FOR UPDATE TO authenticated
    USING (public.is_workspace_owner(workspace_id))
    WITH CHECK (public.is_workspace_owner(workspace_id));

-- El owner puede expulsar; cualquiera puede irse solo.
DROP POLICY IF EXISTS members_delete ON public.workspace_members;
CREATE POLICY members_delete ON public.workspace_members
    FOR DELETE TO authenticated
    USING (public.is_workspace_owner(workspace_id) OR user_id = public.current_user_id());

DROP POLICY IF EXISTS invitations_all ON public.workspace_invitations;
CREATE POLICY invitations_all ON public.workspace_invitations
    FOR ALL TO authenticated
    USING (public.is_workspace_owner(workspace_id))
    WITH CHECK (public.is_workspace_owner(workspace_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invitations TO authenticated;

-- ------------------------------------------------------------
-- 8. workspaces: de "es mio" a "soy miembro"
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users manage own workspaces" ON public.workspaces;

DROP POLICY IF EXISTS workspaces_select ON public.workspaces;
CREATE POLICY workspaces_select ON public.workspaces
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(id));

DROP POLICY IF EXISTS workspaces_insert ON public.workspaces;
CREATE POLICY workspaces_insert ON public.workspaces
    FOR INSERT TO authenticated
    WITH CHECK (user_id = public.current_user_id());

DROP POLICY IF EXISTS workspaces_update ON public.workspaces;
CREATE POLICY workspaces_update ON public.workspaces
    FOR UPDATE TO authenticated
    USING (public.is_workspace_owner(id))
    WITH CHECK (public.is_workspace_owner(id));

DROP POLICY IF EXISTS workspaces_delete ON public.workspaces;
CREATE POLICY workspaces_delete ON public.workspaces
    FOR DELETE TO authenticated
    USING (public.is_workspace_owner(id));

-- ------------------------------------------------------------
-- 9. Tablas de datos: membresia del espacio.
--    En INSERT ademas se exige user_id = yo, para que nadie pueda falsificar
--    la autoria de una fila.
-- ------------------------------------------------------------

-- transactions
DROP POLICY IF EXISTS "USERS SELECT OWN_TRANSACTIONS" ON public.transactions;
DROP POLICY IF EXISTS "USERS INSERT OWN_TRANSACTIONS" ON public.transactions;
DROP POLICY IF EXISTS "USERS UPDATE OWN_TRANSACTIONS" ON public.transactions;
DROP POLICY IF EXISTS "USERS DELETE OWN_TRANSACTIONS" ON public.transactions;

CREATE POLICY transactions_select ON public.transactions
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY transactions_insert ON public.transactions
    FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id) AND user_id = public.current_user_id());
CREATE POLICY transactions_update ON public.transactions
    FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY transactions_delete ON public.transactions
    FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));

-- wallets
DROP POLICY IF EXISTS "USERS SELECT OWN_WALLETS" ON public.wallets;
DROP POLICY IF EXISTS "USERS INSERT OWN_WALLETS" ON public.wallets;
DROP POLICY IF EXISTS "USERS UPDATE OWN_WALLETS" ON public.wallets;
DROP POLICY IF EXISTS "USERS DELETE OWN_WALLETS" ON public.wallets;

CREATE POLICY wallets_select ON public.wallets
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY wallets_insert ON public.wallets
    FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id) AND user_id = public.current_user_id());
CREATE POLICY wallets_update ON public.wallets
    FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY wallets_delete ON public.wallets
    FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));

-- categories
DROP POLICY IF EXISTS "USERS SELECT OWN_CATEGORIES" ON public.categories;
DROP POLICY IF EXISTS "USERS INSERT OWN_CATEGORIES" ON public.categories;
DROP POLICY IF EXISTS "USERS UPDATE OWN_CATEGORIES" ON public.categories;
DROP POLICY IF EXISTS "USERS DELETE OWN_CATEGORIES" ON public.categories;

CREATE POLICY categories_select ON public.categories
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY categories_insert ON public.categories
    FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id) AND user_id = public.current_user_id());
CREATE POLICY categories_update ON public.categories
    FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY categories_delete ON public.categories
    FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));

-- debts
DROP POLICY IF EXISTS "Users manage own debts" ON public.debts;

CREATE POLICY debts_select ON public.debts
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY debts_insert ON public.debts
    FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id) AND user_id = public.current_user_id());
CREATE POLICY debts_update ON public.debts
    FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY debts_delete ON public.debts
    FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));

-- category_groups: los de sistema (workspace_id NULL) se comparten y nadie los toca
DROP POLICY IF EXISTS "Users view own and system groups" ON public.category_groups;
DROP POLICY IF EXISTS "Users insert own groups" ON public.category_groups;
DROP POLICY IF EXISTS "Users update own groups" ON public.category_groups;
DROP POLICY IF EXISTS "Users delete own groups" ON public.category_groups;

CREATE POLICY category_groups_select ON public.category_groups
    FOR SELECT TO authenticated
    USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));
CREATE POLICY category_groups_insert ON public.category_groups
    FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id) AND user_id = public.current_user_id());
CREATE POLICY category_groups_update ON public.category_groups
    FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id) AND NOT coalesce(is_system, false))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY category_groups_delete ON public.category_groups
    FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id) AND NOT coalesce(is_system, false));

-- ------------------------------------------------------------
-- 10. workspace_id pasa a obligatorio donde corresponde.
--     category_groups queda nullable a proposito: los de sistema lo tienen NULL.
-- ------------------------------------------------------------
ALTER TABLE public.transactions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.wallets      ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.categories   ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.debts        ALTER COLUMN workspace_id SET NOT NULL;

-- ------------------------------------------------------------
-- 11. clone_workspace: el chequeo de propiedad pasa a ser de membresia
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clone_workspace(source_ws uuid, new_name text)
RETURNS uuid LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
DECLARE
    v_user UUID;
    v_new  UUID;
BEGIN
    v_user := public.current_user_id();
    IF v_user IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

    IF NOT public.is_workspace_member(source_ws) THEN
        RAISE EXCEPTION 'Espacio de origen no encontrado';
    END IF;

    INSERT INTO public.workspaces (user_id, name) VALUES (v_user, new_name) RETURNING id INTO v_new;

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

    INSERT INTO public.category_groups (id, user_id, name, is_system, workspace_id)
        SELECT m.new_id, v_user, g.name, g.is_system, v_new
        FROM public.category_groups g JOIN _gmap m ON m.old_id = g.id;

    INSERT INTO public.categories (id, user_id, name, type, group_name, group_id, is_recurring, workspace_id)
        SELECT cm.new_id, v_user, c.name, c.type, c.group_name,
               COALESCE(gm.new_id, c.group_id), c.is_recurring, v_new
        FROM public.categories c
        JOIN _cmap cm ON cm.old_id = c.id
        LEFT JOIN _gmap gm ON gm.old_id = c.group_id;

    INSERT INTO public.wallets (id, user_id, name, type, currency_code, bank_name, initial_balance, workspace_id)
        SELECT wm.new_id, v_user, w.name, w.type, w.currency_code, w.bank_name, w.initial_balance, v_new
        FROM public.wallets w JOIN _wmap wm ON wm.old_id = w.id;

    INSERT INTO public.transactions
        (id, user_id, wallet_id, category_id, type, amount, currency_code, exchange_rate,
         description, date, related_transaction_id, invoiced_at, import_batch, deleted_at,
         is_checkpoint, period_month, workspace_id)
        SELECT tm.new_id, v_user, wm.new_id, cm.new_id, t.type, t.amount, t.currency_code, t.exchange_rate,
               t.description, t.date, NULL, t.invoiced_at, t.import_batch, t.deleted_at,
               t.is_checkpoint, t.period_month, v_new
        FROM public.transactions t
        JOIN _tmap tm ON tm.old_id = t.id
        LEFT JOIN _wmap wm ON wm.old_id = t.wallet_id
        LEFT JOIN _cmap cm ON cm.old_id = t.category_id;

    UPDATE public.transactions nt
        SET related_transaction_id = tmr.new_id
        FROM public.transactions ot
        JOIN _tmap tm  ON tm.old_id = ot.id
        JOIN _tmap tmr ON tmr.old_id = ot.related_transaction_id
        WHERE nt.id = tm.new_id AND ot.related_transaction_id IS NOT NULL;

    INSERT INTO public.debts (id, user_id, category_id, total_amount, currency_code, description, workspace_id)
        SELECT gen_random_uuid(), v_user, cm.new_id, d.total_amount, d.currency_code, d.description, v_new
        FROM public.debts d JOIN _cmap cm ON cm.old_id = d.category_id
        WHERE d.workspace_id = source_ws;

    RETURN v_new;
END $function$;
