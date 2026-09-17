# Database Schema (Auto-generated)
> Generated: 2026-09-17T13:33:56.364Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Functions (chunk 2: list_workspace_members — workspace_role)

### `list_workspace_members(ws uuid)` 🔐

- **Returns**: TABLE(id uuid, user_id uuid, email text, full_name text, role text, pending boolean, last_sign_in timestamp with time zone)
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.list_workspace_members(ws uuid)
 RETURNS TABLE(id uuid, user_id uuid, email text, full_name text, role text, pending boolean, last_sign_in timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_see_all(ws) THEN
        RAISE EXCEPTION 'No tenés acceso a esta información en este espacio';
    END IF;

    RETURN QUERY
        SELECT m.id, m.user_id, u.email, u.full_name, m.role, false, au.last_sign_in_at
          FROM public.workspace_members m
          JOIN public.users u ON u.id = m.user_id
          LEFT JOIN auth.users au ON au.id = u.auth_id
         WHERE m.workspace_id = ws

        UNION ALL

        -- Una invitación sin aceptar no tiene cuenta todavía: no hay conexión
        -- que mostrar y la pantalla lo dice como "sin aceptar".
        SELECT i.id, NULL::uuid, i.email, NULL::text, i.role, true, NULL::timestamptz
          FROM public.workspace_invitations i
         WHERE i.workspace_id = ws AND i.accepted_at IS NULL

        ORDER BY 6, 5 DESC, 3;
END;
$function$
```
</details>

### `list_workspace_people(ws uuid)` 🔐

- **Returns**: TABLE(id uuid, full_name text, email text, avatar_url text)
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `log_activity()` 🔐

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `movimiento_del_archivo(ruta text)`

- **Returns**: uuid
- **Kind**: function | IMMUTABLE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.movimiento_del_archivo(ruta text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN split_part(ruta, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN split_part(ruta, '/', 2)::uuid
    END
$function$
```
</details>

### `normalizar_texto(t text)`

- **Returns**: text
- **Kind**: function | IMMUTABLE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.normalizar_texto(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    SELECT btrim(regexp_replace(
        translate(
            lower(coalesce(t, '')),
            'áàäâãéèëêíìïîóòöôõúùüûñç' || chr(65279),
            'aaaaaeeeeiiiiooooouuuunc'
        ),
        '\s+', ' ', 'g'
    ))
$function$
```
</details>

### `partner_positions(ws uuid)` 🔐

- **Returns**: TABLE(id uuid, name text, user_id uuid, ownership_pct numeric, aportes numeric, retiros numeric, saldo numeric, retiros_pct numeric, ultimo_mov timestamp with time zone)
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `pending_settlements(ws uuid)` 🔐

- **Returns**: TABLE(id uuid, settles_at timestamp with time zone, date timestamp with time zone, type text, amount numeric, description text, wallet_id uuid, wallet_name text, category_id uuid, dias integer)
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `protect_is_admin()`

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.protect_is_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'is_admin solo puede cambiarse desde el servidor';
    END IF;
    RETURN NEW;
END;
$function$
```
</details>

### `reconciliation_summary(rec jsonb, op text)` 🔐

- **Returns**: text
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.reconciliation_summary(rec jsonb, op text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_wallet text;
    v_diff   numeric;
BEGIN
    SELECT name INTO v_wallet FROM public.wallets WHERE id = (rec->>'wallet_id')::uuid;
    v_diff := (rec->>'counted_amount')::numeric - (rec->>'expected_amount')::numeric;

    IF op = 'INSERT' THEN
        RETURN 'Arqueó ' || COALESCE(v_wallet, 'una billetera') || ': ' ||
            CASE
                WHEN abs(v_diff) < 0.01 THEN 'cuadra'
                WHEN v_diff < 0 THEN 'faltan ' || to_char(abs(v_diff), 'FM999,999,999,990.00')
                ELSE 'sobran ' || to_char(v_diff, 'FM999,999,999,990.00')
            END;
    END IF;

    IF rec->>'status' = 'resolved' THEN
        RETURN 'Cerró la diferencia del arqueo de ' || COALESCE(v_wallet, 'una billetera') ||
            CASE rec->>'resolution'
                WHEN 'adjusted'  THEN ' asentando un ajuste'
                WHEN 'explained' THEN ' dándola por explicada'
                ELSE ''
            END;
    END IF;

    RETURN 'Editó el arqueo de ' || COALESCE(v_wallet, 'una billetera');
END;
$function$
```
</details>

### `record_reconciliation(w uuid, counted numeric, at_time timestamp with time zone DEFAULT now(), note_text text DEFAULT NULL::text)` 🔐

- **Returns**: wallet_reconciliations
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
    IF NOT public.is_workspace_member(v_ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;
    IF v_me IS NULL THEN RAISE EXCEPTION 'No hay sesión activa'; END IF;

    -- Lo que había sin resolver de esta billetera queda cerrado: el conteo
    -- nuevo lo reemplaza. Se hace ANTES de insertar para que nunca convivan dos
    -- pendientes de la misma caja.
    UPDATE public.wallet_reconciliations
       SET status = 'resolved',
           resolution = 'superseded'
     WHERE wallet_id = w
       AND status = 'pending'
       AND deleted_at IS NULL;

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
```
</details>

### `registrar_uso_reglas(ws uuid, ids uuid[])` 🔐

- **Returns**: void
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `restaurar_purga(purga uuid)` 🔐

- **Returns**: integer
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `set_transaction_fingerprint()`

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.set_transaction_fingerprint()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.fingerprint := public.transaction_fingerprint(
        NEW.wallet_id, NEW.date, NEW.amount, NEW.type::text, NEW.description
    );
    RETURN NEW;
END;
$function$
```
</details>

### `sync_user_profile()` 🔐

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.sync_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    UPDATE public.users u
       SET avatar_url = COALESCE(public.avatar_de_metadata(NEW.raw_user_meta_data), u.avatar_url),
           full_name  = COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), u.full_name),
           email      = COALESCE(NEW.email, u.email)
     WHERE u.auth_id = NEW.id;
    RETURN NEW;
END;
$function$
```
</details>

### `transaction_fingerprint(p_wallet uuid, p_date timestamp with time zone, p_amount numeric, p_type text, p_description text)`

- **Returns**: text
- **Kind**: function | IMMUTABLE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.transaction_fingerprint(p_wallet uuid, p_date timestamp with time zone, p_amount numeric, p_type text, p_description text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    SELECT concat_ws('|',
        to_char(p_date AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
        to_char(abs(p_amount), 'FM9999999999990.00'),
        coalesce(p_wallet::text, ''),
        p_type,
        public.normalizar_texto(p_description)
    )
$function$
```
</details>

### `transferir_categoria(origen uuid, destino uuid)` 🔐

- **Returns**: integer
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.transferir_categoria(origen uuid, destino uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_ws_origen  uuid;
    v_ws_destino uuid;
    v_filas      integer;
BEGIN
    SELECT workspace_id INTO v_ws_origen  FROM public.categories WHERE id = origen;
    SELECT workspace_id INTO v_ws_destino FROM public.categories WHERE id = destino;

    IF v_ws_origen IS NULL OR v_ws_destino IS NULL THEN
        RAISE EXCEPTION 'Categoría no encontrada';
    END IF;
    IF v_ws_origen <> v_ws_destino THEN
        RAISE EXCEPTION 'Las dos categorías tienen que ser del mismo espacio';
    END IF;
    IF NOT public.can_see_all(v_ws_origen) THEN
        RAISE EXCEPTION 'No tenés acceso para reorganizar las categorías de este espacio';
    END IF;

    UPDATE public.transactions
       SET category_id = destino
     WHERE category_id = origen
       AND workspace_id = v_ws_origen;
    GET DIAGNOSTICS v_filas = ROW_COUNT;

    RETURN v_filas;
END;
$function$
```
</details>

### `vaciar_espacio(ws uuid, motivo text DEFAULT NULL::text)` 🔐

- **Returns**: uuid
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `wallet_expected_balance(w uuid, at_time timestamp with time zone DEFAULT now())` 🔐

- **Returns**: numeric
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `workspace_role(ws uuid)` 🔐

- **Returns**: text
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.workspace_role(ws uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT m.role
      FROM public.workspace_members m
      JOIN public.workspaces w ON w.id = m.workspace_id
     WHERE m.workspace_id = ws
       AND m.user_id = public.current_user_id()
       AND w.deleted_at IS NULL
$function$
```
</details>
