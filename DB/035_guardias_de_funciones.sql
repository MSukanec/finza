-- 035 · Cerrar la puerta de atrás: las funciones con permisos elevados
--
-- La 034 cerró las tablas. Esto cierra lo que se las saltea.
--
-- Trece funciones corren con SECURITY DEFINER, o sea con los permisos de quien
-- las creó y no de quien las llama: para ellas RLS no existe. Casi todas
-- verificaban únicamente `is_workspace_member`, así que un colaborador —que ES
-- miembro— podía preguntarles cualquier cosa. `wallet_expected_balance` le
-- cantaba el saldo real de cualquier billetera, `partner_positions` la posición
-- de cada socio y `pending_settlements` los cobros por venir.
--
-- Y dos que ya eran un problema ANTES de que existiera el rol nuevo:
-- `vaciar_espacio` y `restaurar_purga` se conformaban con ser miembro, así que
-- cualquier socio podía borrar los movimientos del espacio entero. Pasan a ser
-- exclusivas del administrador.
--
-- Los cuerpos se generaron desde las definiciones vivas de la base y se les
-- cambió únicamente la guardia, para no reescribir a mano lógica que ya
-- funcionaba. `invite_to_workspace` además acepta el rol nuevo.

CREATE OR REPLACE FUNCTION public.activity_authors(ws uuid)
 RETURNS TABLE(id uuid, full_name text, email text, avatar_url text, es_miembro boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_see_all(ws) THEN
        RAISE EXCEPTION 'No tenés acceso a esta información en este espacio';
    END IF;

    RETURN QUERY
    SELECT u.id,
           u.full_name,
           u.email,
           u.avatar_url,
           EXISTS (
               SELECT 1 FROM public.workspace_members m
                WHERE m.workspace_id = ws AND m.user_id = u.id
           )
      FROM public.users u
     WHERE u.id IN (
        -- Quien figure en el historial...
        SELECT a.user_id FROM public.activity_log a
         WHERE a.workspace_id = ws AND a.user_id IS NOT NULL
        UNION
        -- ...y quien haya cargado un movimiento, para los avatares de la lista.
        SELECT t.user_id FROM public.transactions t
         WHERE t.workspace_id = ws AND t.user_id IS NOT NULL
        UNION
        -- ...más los miembros actuales, aunque todavía no hayan hecho nada.
        SELECT m.user_id FROM public.workspace_members m
         WHERE m.workspace_id = ws
     );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.aprender_regla(ws uuid, p_field text, p_pattern text, p_source text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_category uuid DEFAULT NULL::uuid, p_wallet uuid DEFAULT NULL::uuid, p_match text DEFAULT 'exact'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_pattern text := public.normalizar_texto(p_pattern);
    v_id      uuid;
BEGIN
    IF NOT public.can_see_all(ws) THEN
        RAISE EXCEPTION 'No tenés acceso a esta información en este espacio';
    END IF;
    IF v_pattern = '' THEN
        RAISE EXCEPTION 'La regla necesita un texto que reconocer';
    END IF;

    INSERT INTO public.import_rules
        (workspace_id, user_id, field, source, match_type, pattern, type, category_id, wallet_id)
    VALUES
        (ws, public.current_user_id(), p_field, p_source, p_match, v_pattern, p_type, p_category, p_wallet)
    ON CONFLICT (workspace_id, field, coalesce(source, ''), coalesce(type, ''), pattern)
        WHERE deleted_at IS NULL
    DO UPDATE SET
        category_id = EXCLUDED.category_id,
        wallet_id   = EXCLUDED.wallet_id,
        match_type  = EXCLUDED.match_type,
        updated_at  = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_workspace_members(ws uuid)
 RETURNS TABLE(id uuid, user_id uuid, email text, full_name text, role text, pending boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_see_all(ws) THEN
        RAISE EXCEPTION 'No tenés acceso a esta información en este espacio';
    END IF;

    RETURN QUERY
        SELECT m.id, m.user_id, u.email, u.full_name, m.role, false
          FROM public.workspace_members m
          JOIN public.users u ON u.id = m.user_id
         WHERE m.workspace_id = ws

        UNION ALL

        SELECT i.id, NULL::uuid, i.email, NULL::text, i.role, true
          FROM public.workspace_invitations i
         WHERE i.workspace_id = ws AND i.accepted_at IS NULL

        ORDER BY 6, 5 DESC, 3;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_workspace_people(ws uuid)
 RETURNS TABLE(id uuid, full_name text, email text, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_see_all(ws) THEN
        RAISE EXCEPTION 'No tenés acceso a esta información en este espacio';
    END IF;

    RETURN QUERY
        SELECT u.id, u.full_name, u.email, u.avatar_url
          FROM public.users u
          JOIN public.workspace_members m ON m.user_id = u.id
         WHERE m.workspace_id = ws;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.partner_positions(ws uuid)
 RETURNS TABLE(id uuid, name text, user_id uuid, ownership_pct numeric, aportes numeric, retiros numeric, saldo numeric, retiros_pct numeric, ultimo_mov timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_see_all(ws) THEN
        RAISE EXCEPTION 'No tenés acceso a esta información en este espacio';
    END IF;

    RETURN QUERY
    WITH movs AS (
        SELECT t.partner_id,
               COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'contribution'), 0) AS aportes,
               COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'withdrawal'), 0)   AS retiros,
               MAX(t.date) AS ultimo
          FROM public.transactions t
         WHERE t.workspace_id = ws
           AND t.deleted_at IS NULL
           AND t.partner_id IS NOT NULL
         GROUP BY t.partner_id
    ),
    total AS (SELECT NULLIF(SUM(m.retiros), 0) AS retirado FROM movs m)
    SELECT p.id,
           p.name,
           p.user_id,
           p.ownership_pct,
           COALESCE(m.aportes, 0),
           COALESCE(m.retiros, 0),
           COALESCE(m.aportes, 0) - COALESCE(m.retiros, 0),
           ROUND(100 * COALESCE(m.retiros, 0) / total.retirado, 2),
           m.ultimo
      FROM public.partners p
      LEFT JOIN movs m ON m.partner_id = p.id
      CROSS JOIN total
     WHERE p.workspace_id = ws
       AND p.deleted_at IS NULL
     ORDER BY p.ownership_pct DESC, p.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pending_settlements(ws uuid)
 RETURNS TABLE(id uuid, settles_at timestamp with time zone, date timestamp with time zone, type text, amount numeric, description text, wallet_id uuid, wallet_name text, category_id uuid, dias integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_see_all(ws) THEN
        RAISE EXCEPTION 'No tenés acceso a esta información en este espacio';
    END IF;

    RETURN QUERY
    SELECT t.id,
           t.settles_at,
           t.date,
           t.type::text,
           t.amount,
           t.description,
           t.wallet_id,
           w.name,
           t.category_id,
           (t.settles_at::date - CURRENT_DATE)::int
      FROM public.transactions t
      LEFT JOIN public.wallets w ON w.id = t.wallet_id
     WHERE t.workspace_id = ws
       AND t.deleted_at IS NULL
       AND t.settles_at IS NOT NULL
       AND t.settles_at > now()
     ORDER BY t.settles_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_reconciliation(w uuid, counted numeric, at_time timestamp with time zone DEFAULT now(), note_text text DEFAULT NULL::text)
 RETURNS wallet_reconciliations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_ws       uuid;
    v_me       uuid := public.current_user_id();
    v_expected numeric;
    v_row      public.wallet_reconciliations;
BEGIN
    SELECT workspace_id INTO v_ws FROM public.wallets WHERE id = w AND deleted_at IS NULL;
    IF v_ws IS NULL THEN RAISE EXCEPTION 'La billetera no existe'; END IF;
    IF NOT public.can_see_all(v_ws) THEN
        RAISE EXCEPTION 'No tenés acceso a esta información en este espacio';
    END IF;
    IF v_me IS NULL THEN RAISE EXCEPTION 'No hay sesión activa'; END IF;

    v_expected := public.wallet_expected_balance(w, at_time);

    INSERT INTO public.wallet_reconciliations
        (workspace_id, wallet_id, user_id, counted_at, counted_amount, expected_amount, status, note)
    VALUES (
        v_ws, w, v_me, at_time, counted, v_expected,
        -- Se compara con tolerancia de un centavo: numeric no tiene el problema
        -- del punto flotante, pero un redondeo de conversión sí puede colarse.
        CASE WHEN abs(counted - v_expected) < 0.01 THEN 'matched' ELSE 'pending' END,
        note_text
    )
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_uso_reglas(ws uuid, ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_see_all(ws) THEN
        RAISE EXCEPTION 'No tenés acceso a esta información en este espacio';
    END IF;

    UPDATE public.import_rules
       SET hits = hits + 1, last_used_at = now()
     WHERE workspace_id = ws AND id = ANY(ids);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restaurar_purga(purga uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_ws    uuid;
    v_hecho timestamptz;
    v_filas integer;
BEGIN
    SELECT workspace_id, restored_at INTO v_ws, v_hecho FROM public.purges WHERE id = purga;

    IF v_ws IS NULL OR NOT public.is_workspace_owner(v_ws) THEN
        RAISE EXCEPTION 'El vaciado no existe, o solo el administrador puede deshacerlo';
    END IF;
    IF v_hecho IS NOT NULL THEN
        RAISE EXCEPTION 'Ese vaciado ya se restauró el %', v_hecho::date;
    END IF;

    PERFORM set_config('app.silenciar_historial', 'on', true);

    UPDATE public.transactions
       SET deleted_at = NULL
     WHERE purge_id = purga AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_filas = ROW_COUNT;

    UPDATE public.wallets w
       SET initial_balance = (b.valor->>'initial_balance')::numeric
      FROM (SELECT jsonb_array_elements(balances) AS valor FROM public.purges WHERE id = purga) b
     WHERE w.id = (b.valor->>'wallet_id')::uuid;

    UPDATE public.purges SET restored_at = now() WHERE id = purga;

    RETURN v_filas;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.vaciar_espacio(ws uuid, motivo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_id     uuid;
    v_saldos jsonb;
    v_filas  integer;
BEGIN
    IF NOT public.is_workspace_owner(ws) THEN
        RAISE EXCEPTION 'Solo el administrador del espacio puede vaciarlo';
    END IF;

    PERFORM set_config('app.silenciar_historial', 'on', true);

    SELECT coalesce(jsonb_agg(jsonb_build_object('wallet_id', id, 'initial_balance', initial_balance)), '[]'::jsonb)
      INTO v_saldos
      FROM public.wallets
     WHERE workspace_id = ws AND deleted_at IS NULL AND initial_balance <> 0;

    INSERT INTO public.purges (workspace_id, user_id, reason, balances)
    VALUES (ws, public.current_user_id(), nullif(btrim(coalesce(motivo, '')), ''), v_saldos)
    RETURNING id INTO v_id;

    UPDATE public.transactions
       SET deleted_at = now(), purge_id = v_id
     WHERE workspace_id = ws AND deleted_at IS NULL;
    GET DIAGNOSTICS v_filas = ROW_COUNT;

    UPDATE public.wallets
       SET initial_balance = 0
     WHERE workspace_id = ws AND deleted_at IS NULL AND initial_balance <> 0;

    UPDATE public.purges SET transactions_count = v_filas WHERE id = v_id;

    RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.wallet_expected_balance(w uuid, at_time timestamp with time zone DEFAULT now())
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_ws  uuid;
    v_bal numeric;
BEGIN
    SELECT workspace_id INTO v_ws FROM public.wallets WHERE id = w;

    -- Mismo mensaje para "no existe" y "no sos miembro": distinguirlos
    -- convertiría la función en un detector de billeteras ajenas.
    IF v_ws IS NULL OR NOT public.can_see_all(v_ws) THEN
        RAISE EXCEPTION 'La billetera no existe o no tenés acceso';
    END IF;

    WITH alcance AS (
        -- La propia más sus subcuentas. Para una hoja, sólo la propia.
        SELECT id, initial_balance FROM public.wallets
         WHERE (id = w OR parent_id = w) AND deleted_at IS NULL
    )
    SELECT COALESCE(SUM(a.initial_balance), 0)
         + COALESCE((
             SELECT SUM(
                 CASE WHEN t.type IN ('income', 'contribution') THEN t.amount ELSE -t.amount END
             )
               FROM public.transactions t
              WHERE t.wallet_id IN (SELECT id FROM alcance)
                AND t.deleted_at IS NULL
                AND COALESCE(t.settles_at, t.date) <= at_time
           ), 0)
      INTO v_bal
      FROM alcance a;

    RETURN v_bal;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.invite_to_workspace(ws uuid, invitee_email text, invitee_role text DEFAULT 'member'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    IF invitee_role NOT IN ('owner','member','collaborator') THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.clone_workspace(source_ws uuid, new_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user UUID;
    v_new  UUID;
BEGIN
    v_user := public.current_user_id();
    IF v_user IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

    IF NOT public.can_see_all(source_ws) THEN
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
END $function$
;
