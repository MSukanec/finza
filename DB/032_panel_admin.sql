-- 032 · Panel de administración: quién se registró en la app
--
-- LÍMITE, y es a propósito: esto devuelve datos de CUENTA —quién se registró,
-- cuándo, si entró alguna vez— y nada de plata. El administrador de la app no
-- ve movimientos, saldos ni espacios ajenos. Para eso sigue mandando RLS, que
-- corta por membresía y no tiene excepción para administradores.
--
-- El control es `is_admin` sobre la fila del que llama. Esa columna no se puede
-- tocar desde el cliente: el disparador `guard_is_admin` (DB/018) rechaza
-- cualquier cambio que venga con `auth.uid()` puesto, así que un usuario no
-- puede hacerse administrador a sí mismo.

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
    id            uuid,
    email         text,
    full_name     text,
    avatar_url    text,
    is_admin      boolean,
    created_at    timestamptz,
    /** Último ingreso, de auth.users. NULL si se registró y nunca entró. */
    last_sign_in  timestamptz,
    /** En cuántos espacios está. No dice cuáles ni qué hay adentro. */
    espacios      integer,
    /** Si todavía tiene invitaciones sin aceptar. */
    invitado      boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_me uuid := public.current_user_id();
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'No hay sesión activa';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_admin) THEN
        RAISE EXCEPTION 'No tenés permiso para ver esto';
    END IF;

    RETURN QUERY
    SELECT u.id,
           u.email,
           u.full_name,
           u.avatar_url,
           u.is_admin,
           u.created_at,
           au.last_sign_in_at,
           (SELECT count(*)::int FROM public.workspace_members m WHERE m.user_id = u.id),
           EXISTS (
               SELECT 1 FROM public.workspace_invitations i
                WHERE lower(i.email) = lower(u.email) AND i.accepted_at IS NULL
           )
      FROM public.users u
      LEFT JOIN auth.users au ON au.id = u.auth_id
     ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- ------------------------------------------------- Quién se sumó al espacio

/**
 * `log_activity` tomaba el autor de `current_user_id()`, que durante el alta de
 * un usuario es NULL: el disparador corre mientras se crea la sesión, no
 * después. Resultado: "se sumó al espacio" quedaba sin autor y, desde que el
 * historial muestra sólo acciones de personas, no aparecía en ninguna parte.
 *
 * Para una membresía el autor correcto es el propio miembro: sumarse al
 * espacio es algo que hizo esa persona.
 */
CREATE OR REPLACE FUNCTION public.log_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rec     jsonb;
    v_old     jsonb;
    v_ws      uuid;
    v_actor   uuid;
    v_action  text;
    v_verbo   text;
    v_summary text;
    v_changes jsonb;
    v_nombre  text;
    k         text;
BEGIN
    v_rec := to_jsonb(COALESCE(NEW, OLD));
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;

    v_ws := COALESCE(
        (v_rec->>'workspace_id')::uuid,
        CASE WHEN TG_TABLE_NAME = 'workspaces' THEN (v_rec->>'id')::uuid END
    );

    v_actor := public.current_user_id();

    -- Sumarse a un espacio lo hace el propio miembro, y el alta corre sin
    -- sesion (auth.uid() todavia es NULL): sin esto la entrada quedaba sin
    -- autor y, desde que el historial muestra solo acciones de personas, no
    -- aparecia en ninguna parte.
    IF v_actor IS NULL AND TG_TABLE_NAME = 'workspace_members' THEN
        v_actor := (v_rec->>'user_id')::uuid;
    END IF;

    v_action := lower(TG_OP);
    IF TG_OP = 'UPDATE' THEN
        IF v_old->>'deleted_at' IS NULL AND v_rec->>'deleted_at' IS NOT NULL THEN
            v_action := 'delete';
        ELSIF v_old->>'deleted_at' IS NOT NULL AND v_rec->>'deleted_at' IS NULL THEN
            v_action := 'insert';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'wallet_reconciliations' THEN
        v_summary := public.reconciliation_summary(v_rec, TG_OP);
    ELSE
        v_nombre := COALESCE(
            NULLIF(v_rec->>'description', ''),
            NULLIF(v_rec->>'name', ''),
            NULLIF(v_rec->>'email', '')
        );

        v_verbo := CASE
            WHEN v_action = 'delete' THEN 'Eliminó'
            WHEN TG_OP = 'INSERT' THEN 'Creó'
            WHEN v_action = 'insert' THEN 'Restauró'
            ELSE 'Editó'
        END;

        v_summary := v_verbo || ' ' || public.entity_label(TG_TABLE_NAME)
            || COALESCE(' «' || left(v_nombre, 80) || '»', '');
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_changes := '{}'::jsonb;
        FOR k IN SELECT jsonb_object_keys(v_rec) LOOP
            IF k NOT IN ('updated_at', 'created_at')
               AND v_rec->k IS DISTINCT FROM v_old->k THEN
                v_changes := v_changes || jsonb_build_object(
                    k, jsonb_build_object('antes', v_old->k, 'despues', v_rec->k)
                );
            END IF;
        END LOOP;

        IF v_changes = '{}'::jsonb THEN
            RETURN COALESCE(NEW, OLD);
        END IF;

        IF v_action IN ('delete', 'insert') THEN
            v_changes := v_changes - 'deleted_at';
            IF v_changes = '{}'::jsonb THEN v_changes := NULL; END IF;
        END IF;
    END IF;

    INSERT INTO public.activity_log
        (workspace_id, user_id, action, entity, entity_id, summary, changes)
    VALUES (v_ws, v_actor, v_action, TG_TABLE_NAME, (v_rec->>'id')::uuid, v_summary, v_changes);

    RETURN COALESCE(NEW, OLD);
END;
$function$
;

-- ------------------------------------------------- Etiqueta de socios

-- Sin esto el historial decía "Editó partners «Pablo»".
CREATE OR REPLACE FUNCTION public.entity_label(tabla text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
    SELECT CASE tabla
        WHEN 'transactions'           THEN 'movimiento'
        WHEN 'wallets'                THEN 'billetera'
        WHEN 'categories'             THEN 'categoría'
        WHEN 'category_groups'        THEN 'grupo de categorías'
        WHEN 'debts'                  THEN 'deuda'
        WHEN 'budgets'                THEN 'presupuesto'
        WHEN 'workspaces'             THEN 'espacio'
        WHEN 'workspace_members'      THEN 'miembro'
        WHEN 'wallet_reconciliations' THEN 'arqueo'
        WHEN 'partners'               THEN 'socio'
        ELSE tabla
    END
$function$;

-- Las entradas ya escritas guardaron el texto armado, así que se corrigen.
UPDATE public.activity_log
   SET summary = replace(summary, ' partners ', ' socio ')
 WHERE entity = 'partners' AND summary LIKE '% partners %';
