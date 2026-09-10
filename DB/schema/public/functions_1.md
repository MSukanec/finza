# Database Schema (Auto-generated)
> Generated: 2026-09-10T19:29:15.251Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Functions (chunk 1: activity_authors — log_activity)

### `activity_authors(ws uuid)` 🔐

- **Returns**: TABLE(id uuid, full_name text, email text, avatar_url text, es_miembro boolean)
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `admin_list_users()` 🔐

- **Returns**: TABLE(id uuid, email text, full_name text, avatar_url text, is_admin boolean, created_at timestamp with time zone, last_sign_in timestamp with time zone, espacios integer, invitado boolean)
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(id uuid, email text, full_name text, avatar_url text, is_admin boolean, created_at timestamp with time zone, last_sign_in timestamp with time zone, espacios integer, invitado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
```
</details>

### `aprender_regla(ws uuid, p_field text, p_pattern text, p_source text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_category uuid DEFAULT NULL::uuid, p_wallet uuid DEFAULT NULL::uuid, p_match text DEFAULT 'exact'::text)` 🔐

- **Returns**: uuid
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `avatar_de_metadata(meta jsonb)`

- **Returns**: text
- **Kind**: function | IMMUTABLE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.avatar_de_metadata(meta jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT NULLIF(COALESCE(meta->>'avatar_url', meta->>'picture'), '')
$function$
```
</details>

### `billeteras_para_cargar(ws uuid)` 🔐

- **Returns**: TABLE(id uuid, name text, type text, currency_code text)
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.billeteras_para_cargar(ws uuid)
 RETURNS TABLE(id uuid, name text, type text, currency_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
```
</details>

### `can_see_all(ws uuid)` 🔐

- **Returns**: boolean
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.can_see_all(ws uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT coalesce(public.workspace_role(ws) IN ('owner', 'member'), false)
$function$
```
</details>

### `check_wallet_depth()`

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.check_wallet_depth()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        IF NEW.parent_id = NEW.id THEN
            RAISE EXCEPTION 'Una billetera no puede ser su propia cuenta madre';
        END IF;
        IF EXISTS (SELECT 1 FROM public.wallets w WHERE w.id = NEW.parent_id AND w.parent_id IS NOT NULL) THEN
            RAISE EXCEPTION 'Sólo se permite un nivel de subcuentas';
        END IF;
        IF EXISTS (SELECT 1 FROM public.wallets w WHERE w.parent_id = NEW.id) THEN
            RAISE EXCEPTION 'Esta billetera ya tiene subcuentas: no puede colgar de otra';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
```
</details>

### `check_wallet_is_leaf()`

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.check_wallet_is_leaf()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.wallet_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.wallets w WHERE w.parent_id = NEW.wallet_id AND w.deleted_at IS NULL)
    THEN
        RAISE EXCEPTION 'Esa billetera agrupa subcuentas: el movimiento va en una de ellas';
    END IF;
    RETURN NEW;
END;
$function$
```
</details>

### `clone_workspace(source_ws uuid, new_name text)`

- **Returns**: uuid
- **Kind**: function | VOLATILE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
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
```
</details>

### `current_user_id()` 🔐

- **Returns**: uuid
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.current_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT id FROM public.users WHERE auth_id = auth.uid() $function$
```
</details>

### `entity_label(tabla text)`

- **Returns**: text
- **Kind**: function | IMMUTABLE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.entity_label(tabla text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
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
$function$
```
</details>

### `handle_new_user()` 🔐

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user uuid;
BEGIN
    INSERT INTO public.users (auth_id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        public.avatar_de_metadata(NEW.raw_user_meta_data)
    )
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
$function$
```
</details>

### `handle_new_workspace()` 🔐

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (NEW.id, NEW.user_id, 'owner')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$function$
```
</details>

### `handle_updated_at()` 🔐

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
```
</details>

### `invite_to_workspace(ws uuid, invitee_email text, invitee_role text DEFAULT 'member'::text)` 🔐

- **Returns**: text
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
```
</details>

### `is_workspace_member(ws uuid)` 🔐

- **Returns**: boolean
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM public.workspace_members m
          JOIN public.workspaces w ON w.id = m.workspace_id
         WHERE m.workspace_id = ws
           AND m.user_id = public.current_user_id()
           AND w.deleted_at IS NULL
    )
$function$
```
</details>

### `is_workspace_owner(ws uuid)` 🔐

- **Returns**: boolean
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.is_workspace_owner(ws uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM public.workspace_members m
          JOIN public.workspaces w ON w.id = m.workspace_id
         WHERE m.workspace_id = ws
           AND m.user_id = public.current_user_id()
           AND m.role = 'owner'
           AND w.deleted_at IS NULL
    )
$function$
```
</details>

### `list_workspace_members(ws uuid)` 🔐

- **Returns**: TABLE(id uuid, user_id uuid, email text, full_name text, role text, pending boolean)
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
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
