# Database Schema (Auto-generated)
> Generated: 2026-09-10T19:02:05.896Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Functions (chunk 2: reconciliation_summary — wallet_expected_balance)

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
    IF NOT public.is_workspace_member(ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;

    UPDATE public.import_rules
       SET hits = hits + 1, last_used_at = now()
     WHERE workspace_id = ws AND id = ANY(ids);
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
    IF v_ws IS NULL OR NOT public.is_workspace_member(v_ws) THEN
        RAISE EXCEPTION 'La billetera no existe o no tenés acceso';
    END IF;

    SELECT COALESCE((SELECT initial_balance FROM public.wallets WHERE id = w), 0)
         + COALESCE((
             SELECT SUM(
                 CASE WHEN t.type IN ('income', 'contribution') THEN t.amount ELSE -t.amount END
             )
               FROM public.transactions t
              WHERE t.wallet_id = w
                AND t.deleted_at IS NULL
                AND COALESCE(t.settles_at, t.date) <= at_time
           ), 0)
      INTO v_bal;

    RETURN v_bal;
END;
$function$
```
</details>
