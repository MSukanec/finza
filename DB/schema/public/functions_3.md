# Database Schema (Auto-generated)
> Generated: 2026-09-18T12:53:26.719Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Functions (chunk 3: transferir_categoria — workspace_role)

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

### `uso_de_billetera(billetera uuid)` 🔐

- **Returns**: jsonb
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.uso_de_billetera(billetera uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_ws uuid;
    v    jsonb;
BEGIN
    SELECT workspace_id INTO v_ws FROM public.wallets WHERE id = billetera AND deleted_at IS NULL;
    IF v_ws IS NULL THEN
        RAISE EXCEPTION 'Billetera no encontrada';
    END IF;
    IF NOT public.can_see_all(v_ws) THEN
        RAISE EXCEPTION 'No tenés acceso para administrar las billeteras de este espacio';
    END IF;

    SELECT jsonb_build_object(
        'movimientos',         (SELECT count(*) FROM public.transactions t WHERE t.wallet_id = billetera AND t.deleted_at IS NULL),
        'movimientos_de_baja', (SELECT count(*) FROM public.transactions t WHERE t.wallet_id = billetera AND t.deleted_at IS NOT NULL),
        'arqueos',             (SELECT count(*) FROM public.wallet_reconciliations r WHERE r.wallet_id = billetera AND r.deleted_at IS NULL),
        'reglas',              (SELECT count(*) FROM public.import_rules i WHERE i.wallet_id = billetera AND i.deleted_at IS NULL),
        'subcuentas',          (SELECT count(*) FROM public.wallets h WHERE h.parent_id = billetera AND h.deleted_at IS NULL),
        'saldo_inicial',       (SELECT initial_balance FROM public.wallets WHERE id = billetera)
    ) INTO v;

    RETURN v || jsonb_build_object(
        'total',
        (v->>'movimientos')::int + (v->>'movimientos_de_baja')::int + (v->>'arqueos')::int
        + (v->>'reglas')::int + (v->>'subcuentas')::int
        -- Un saldo inicial distinto de cero también es "estar en uso": si se
        -- borrara sin más, ese dinero desaparecería del total del espacio.
        + CASE WHEN (v->>'saldo_inicial')::numeric <> 0 THEN 1 ELSE 0 END
    );
END;
$function$
```
</details>

### `uso_de_categoria(cat uuid)` 🔐

- **Returns**: jsonb
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.uso_de_categoria(cat uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_ws uuid;
    v    jsonb;
BEGIN
    SELECT workspace_id INTO v_ws FROM public.categories WHERE id = cat AND deleted_at IS NULL;
    IF v_ws IS NULL THEN
        RAISE EXCEPTION 'Categoría no encontrada';
    END IF;
    IF NOT public.can_see_all(v_ws) THEN
        RAISE EXCEPTION 'No tenés acceso para administrar las categorías de este espacio';
    END IF;

    SELECT jsonb_build_object(
        'movimientos',        (SELECT count(*) FROM public.transactions t WHERE t.category_id = cat AND t.deleted_at IS NULL),
        -- Dados de baja pero recuperables: un vaciado se deshace. Si no se
        -- migraran, volverían apuntando a una categoría que ya no existe.
        'movimientos_de_baja',(SELECT count(*) FROM public.transactions t WHERE t.category_id = cat AND t.deleted_at IS NOT NULL),
        'deudas',             (SELECT count(*) FROM public.debts d WHERE d.category_id = cat AND d.deleted_at IS NULL),
        'presupuestos',       (SELECT count(*) FROM public.budget_categories b JOIN public.budgets p ON p.id = b.budget_id
                                WHERE b.category_id = cat AND p.deleted_at IS NULL),
        'reglas',             (SELECT count(*) FROM public.import_rules r WHERE r.category_id = cat AND r.deleted_at IS NULL)
    ) INTO v;

    RETURN v || jsonb_build_object(
        'total',
        (v->>'movimientos')::int + (v->>'movimientos_de_baja')::int + (v->>'deudas')::int
        + (v->>'presupuestos')::int + (v->>'reglas')::int
    );
END;
$function$
```
</details>

### `uso_de_grupo(grupo uuid)` 🔐

- **Returns**: jsonb
- **Kind**: function | STABLE | SECURITY DEFINER

<details><summary>Source</summary>

```sql
CREATE OR REPLACE FUNCTION public.uso_de_grupo(grupo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_grupo public.category_groups%ROWTYPE;
BEGIN
    SELECT * INTO v_grupo FROM public.category_groups WHERE id = grupo AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Macrogrupo no encontrado';
    END IF;
    -- Un grupo de sistema lo usan todos los espacios. Se cuenta sólo lo del
    -- espacio activo de quien pregunta, que es lo que puede ver.
    IF v_grupo.workspace_id IS NOT NULL AND NOT public.can_see_all(v_grupo.workspace_id) THEN
        RAISE EXCEPTION 'No tenés acceso para administrar las categorías de este espacio';
    END IF;

    RETURN (
        SELECT jsonb_build_object(
            'categorias_de_egreso',  count(*) FILTER (WHERE c.type::text = 'expense'),
            'categorias_de_ingreso', count(*) FILTER (WHERE c.type::text = 'income'),
            'categorias',            count(*),
            'movimientos',           coalesce(sum((SELECT count(*) FROM public.transactions t
                                                    WHERE t.category_id = c.id AND t.deleted_at IS NULL)), 0),
            'total',                 count(*)
        )
          FROM public.categories c
         WHERE c.group_id = grupo
           AND c.deleted_at IS NULL
           AND (v_grupo.workspace_id IS NOT NULL OR public.can_see_all(c.workspace_id))
    );
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
