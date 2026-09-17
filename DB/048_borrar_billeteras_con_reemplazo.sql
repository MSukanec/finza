-- 048 · Borrar billeteras, con reemplazo
--
-- No se podían borrar: no había función ni botón. Mismo flujo que categorías y
-- macrogrupos (DB/047): se dice en qué está usada, y si lo está se elige con
-- cuál reemplazarla y se migra todo antes de darla de baja.
--
-- Una billetera arrastra más cosas que una categoría, y tres son fáciles de
-- olvidar:
--
--   1. El SALDO INICIAL. El saldo de una billetera es su saldo inicial más sus
--      movimientos. Si se mueven los movimientos pero no el saldo inicial,
--      desaparece plata que existe. Por eso se suma al de la que reemplaza, y
--      por eso las dos tienen que ser de la MISMA MONEDA: sumar pesos a una
--      cuenta en dólares sería inventar un número.
--   2. Los ARQUEOS. Son el historial de cuánta plata se contó ahí. Van con los
--      movimientos: esa plata ahora vive en la otra billetera.
--   3. Las SUBCUENTAS. Borrar "Efectivo" no puede borrar las tres cajas que
--      cuelgan de él. Quedan sueltas, cada una con su saldo, y se pueden
--      volver a agrupar después. No se las cuelga de la que reemplaza porque
--      una billetera que agrupa NO recibe movimientos, y esa misma billetera
--      está recibiendo los de la borrada.

/** En qué está usada una billetera. Cuenta lo que la pantalla no ve. */
CREATE OR REPLACE FUNCTION public.uso_de_billetera(billetera uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

/**
 * Borra una billetera. Si está en uso, exige con cuál reemplazarla y le pasa
 * todo: movimientos (vivos y dados de baja), arqueos, reglas de importación y
 * el saldo inicial.
 *
 * La que reemplaza tiene que ser del mismo espacio, de la misma moneda y una
 * billetera que reciba movimientos (no una que agrupe subcuentas).
 */
CREATE OR REPLACE FUNCTION public.borrar_billetera(billetera uuid, reemplazo uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.uso_de_billetera(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.borrar_billetera(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.uso_de_billetera(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_billetera(uuid, uuid) TO authenticated;
