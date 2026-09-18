# Database Schema (Auto-generated)
> Generated: 2026-09-18T12:53:26.719Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Functions (chunk 1: activity_authors — handle_new_workspace)

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

- **Returns**: TABLE(id uuid, name text, type text, currency_code text, parent_id uuid, allows_deferred_payment boolean)
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.billeteras_para_cargar(ws uuid)
 RETURNS TABLE(id uuid, name text, type text, currency_code text, parent_id uuid, allows_deferred_payment boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.is_workspace_member(ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;

    -- Sigue sin saldos: nombre, moneda, jerarquía y si acepta pagos a fecha.
    RETURN QUERY
        SELECT w.id, w.name, w.type::text, w.currency_code, w.parent_id, w.allows_deferred_payment
          FROM public.wallets w
         WHERE w.workspace_id = ws AND w.deleted_at IS NULL
         ORDER BY w.name;
END;
$function$
```
</details>

### `borrar_billetera(billetera uuid, reemplazo uuid DEFAULT NULL::uuid)` 🔐

- **Returns**: jsonb
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.borrar_billetera(billetera uuid, reemplazo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_w    public.wallets%ROWTYPE;
    v_dest public.wallets%ROWTYPE;
    v_uso  jsonb;
BEGIN
    SELECT * INTO v_w FROM public.wallets WHERE id = billetera AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Billetera no encontrada';
    END IF;

    -- También verifica el acceso.
    v_uso := public.uso_de_billetera(billetera);

    IF reemplazo IS NULL THEN
        IF (v_uso->>'total')::int > 0 THEN
            RAISE EXCEPTION 'La billetera "%" está en uso: elegí con cuál reemplazarla', v_w.name;
        END IF;
    ELSE
        SELECT * INTO v_dest FROM public.wallets WHERE id = reemplazo AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La billetera de reemplazo no existe';
        END IF;
        IF v_dest.id = v_w.id THEN
            RAISE EXCEPTION 'Una billetera no se puede reemplazar por sí misma';
        END IF;
        IF v_dest.workspace_id <> v_w.workspace_id THEN
            RAISE EXCEPTION 'La billetera de reemplazo es de otro espacio';
        END IF;
        IF v_dest.currency_code <> v_w.currency_code THEN
            RAISE EXCEPTION 'No se puede reemplazar una billetera en % por una en %: los saldos no se pueden sumar',
                v_w.currency_code, v_dest.currency_code;
        END IF;
        -- Una billetera que agrupa no recibe movimientos (DB/037): la base los
        -- rechazaría de a uno y quedaría todo a medias.
        IF EXISTS (SELECT 1 FROM public.wallets h WHERE h.parent_id = v_dest.id AND h.deleted_at IS NULL) THEN
            RAISE EXCEPTION 'La billetera "%" agrupa subcuentas y no recibe movimientos: elegí una de sus cajas', v_dest.name;
        END IF;

        UPDATE public.transactions SET wallet_id = reemplazo WHERE wallet_id = billetera;
        UPDATE public.wallet_reconciliations SET wallet_id = reemplazo WHERE wallet_id = billetera;
        UPDATE public.import_rules SET wallet_id = reemplazo WHERE wallet_id = billetera;

        -- La plata que había antes del primer movimiento sigue existiendo.
        UPDATE public.wallets
           SET initial_balance = initial_balance + v_w.initial_balance
         WHERE id = reemplazo;
    END IF;

    -- Las subcuentas quedan sueltas, con su saldo. Va después de mover los
    -- movimientos: si la que reemplaza fuera una de ellas, primero recibe y
    -- después deja de colgar de la que se borra.
    UPDATE public.wallets SET parent_id = NULL WHERE parent_id = billetera;

    UPDATE public.wallets SET deleted_at = now() WHERE id = billetera;

    RETURN v_uso;
END;
$function$
```
</details>

### `borrar_categoria(cat uuid, reemplazo uuid DEFAULT NULL::uuid)` 🔐

- **Returns**: jsonb
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.borrar_categoria(cat uuid, reemplazo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_cat   public.categories%ROWTYPE;
    v_dest  public.categories%ROWTYPE;
    v_uso   jsonb;
BEGIN
    SELECT * INTO v_cat FROM public.categories WHERE id = cat AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Categoría no encontrada';
    END IF;

    -- También verifica el acceso.
    v_uso := public.uso_de_categoria(cat);

    IF reemplazo IS NULL THEN
        IF (v_uso->>'total')::int > 0 THEN
            RAISE EXCEPTION 'La categoría "%" está en uso: elegí con cuál reemplazarla', v_cat.name;
        END IF;
    ELSE
        SELECT * INTO v_dest FROM public.categories WHERE id = reemplazo AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La categoría de reemplazo no existe';
        END IF;
        IF v_dest.id = v_cat.id THEN
            RAISE EXCEPTION 'Una categoría no se puede reemplazar por sí misma';
        END IF;
        IF v_dest.workspace_id <> v_cat.workspace_id THEN
            RAISE EXCEPTION 'La categoría de reemplazo es de otro espacio';
        END IF;
        IF v_dest.type <> v_cat.type THEN
            RAISE EXCEPTION 'Una categoría de % no se puede reemplazar por una de %',
                CASE v_cat.type::text WHEN 'income' THEN 'ingresos' ELSE 'egresos' END,
                CASE v_dest.type::text WHEN 'income' THEN 'ingresos' ELSE 'egresos' END;
        END IF;

        -- Movimientos, vivos y dados de baja, de quien sean.
        PERFORM public.transferir_categoria(cat, reemplazo);

        UPDATE public.debts SET category_id = reemplazo WHERE category_id = cat;

        -- Presupuestos que ya tenían el reemplazo: se suman los límites.
        UPDATE public.budget_categories destino
           SET limit_amount = destino.limit_amount + origen.limit_amount
          FROM public.budget_categories origen
         WHERE origen.category_id = cat
           AND destino.category_id = reemplazo
           AND destino.budget_id = origen.budget_id;
        DELETE FROM public.budget_categories origen
         WHERE origen.category_id = cat
           AND EXISTS (SELECT 1 FROM public.budget_categories d
                        WHERE d.budget_id = origen.budget_id AND d.category_id = reemplazo);
        UPDATE public.budget_categories SET category_id = reemplazo WHERE category_id = cat;

        UPDATE public.import_rules SET category_id = reemplazo WHERE category_id = cat;
    END IF;

    UPDATE public.categories SET deleted_at = now() WHERE id = cat;

    RETURN v_uso;
END;
$function$
```
</details>

### `borrar_grupo(grupo uuid, reemplazo uuid DEFAULT NULL::uuid)` 🔐

- **Returns**: jsonb
- **Kind**: function | VOLATILE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.borrar_grupo(grupo uuid, reemplazo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_grupo     public.category_groups%ROWTYPE;
    v_dest      public.category_groups%ROWTYPE;
    v_cat       public.categories%ROWTYPE;
    v_gemela    uuid;
    v_movidas   integer := 0;
    v_fusionadas integer := 0;
    v_cuantas   integer;
BEGIN
    SELECT * INTO v_grupo FROM public.category_groups WHERE id = grupo AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Macrogrupo no encontrado';
    END IF;
    IF v_grupo.workspace_id IS NULL OR v_grupo.is_system THEN
        RAISE EXCEPTION 'El macrogrupo "%" es del sistema y no se puede borrar', v_grupo.name;
    END IF;
    IF NOT public.can_see_all(v_grupo.workspace_id) THEN
        RAISE EXCEPTION 'No tenés acceso para administrar las categorías de este espacio';
    END IF;

    SELECT count(*) INTO v_cuantas FROM public.categories WHERE group_id = grupo AND deleted_at IS NULL;

    IF v_cuantas > 0 THEN
        IF reemplazo IS NULL THEN
            RAISE EXCEPTION 'El macrogrupo "%" tiene % categoría(s): elegí a qué grupo pasarlas', v_grupo.name, v_cuantas;
        END IF;

        SELECT * INTO v_dest FROM public.category_groups WHERE id = reemplazo AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El macrogrupo de reemplazo no existe';
        END IF;
        IF v_dest.id = v_grupo.id THEN
            RAISE EXCEPTION 'Un macrogrupo no se puede reemplazar por sí mismo';
        END IF;
        IF v_dest.workspace_id IS NOT NULL AND v_dest.workspace_id <> v_grupo.workspace_id THEN
            RAISE EXCEPTION 'El macrogrupo de reemplazo es de otro espacio';
        END IF;

        FOR v_cat IN
            SELECT * FROM public.categories WHERE group_id = grupo AND deleted_at IS NULL
        LOOP
            SELECT d.id INTO v_gemela
              FROM public.categories d
             WHERE d.group_id = reemplazo
               AND d.deleted_at IS NULL
               AND d.workspace_id = v_cat.workspace_id
               AND d.type = v_cat.type
               AND lower(btrim(d.name)) = lower(btrim(v_cat.name))
             LIMIT 1;

            IF v_gemela IS NOT NULL THEN
                PERFORM public.borrar_categoria(v_cat.id, v_gemela);
                v_fusionadas := v_fusionadas + 1;
            ELSE
                UPDATE public.categories SET group_id = reemplazo WHERE id = v_cat.id;
                v_movidas := v_movidas + 1;
            END IF;
        END LOOP;
    END IF;

    UPDATE public.category_groups SET deleted_at = now() WHERE id = grupo;

    RETURN jsonb_build_object('movidas', v_movidas, 'fusionadas', v_fusionadas);
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

### `completar_adjunto()`

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.completar_adjunto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    SELECT t.workspace_id INTO NEW.workspace_id
      FROM public.transactions t
     WHERE t.id = NEW.transaction_id;

    IF auth.uid() IS NOT NULL THEN
        NEW.user_id := public.current_user_id();
    END IF;

    RETURN NEW;
END;
$function$
```
</details>

### `copiar_nombre_de_grupo()`

- **Returns**: trigger
- **Kind**: function | VOLATILE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.copiar_nombre_de_grupo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    SELECT g.name INTO NEW.group_name FROM public.category_groups g WHERE g.id = NEW.group_id;
    RETURN NEW;
END;
$function$
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

### `espacio_del_archivo(ruta text)`

- **Returns**: uuid
- **Kind**: function | IMMUTABLE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.espacio_del_archivo(ruta text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN split_part(ruta, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN split_part(ruta, '/', 1)::uuid
    END
$function$
```
</details>

### `espacio_del_canal(canal text)`

- **Returns**: uuid
- **Kind**: function | IMMUTABLE | SECURITY INVOKER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.espacio_del_canal(canal text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN canal ~ '^presencia:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN substring(canal from 11)::uuid
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
