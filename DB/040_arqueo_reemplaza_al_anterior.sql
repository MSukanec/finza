-- 040 · Un arqueo nuevo reemplaza al anterior sin resolver
--
-- Se podían acumular varios arqueos pendientes de la misma billetera. Pasó:
-- la caja registradora quedó con dos, uno de $7.000.000 y otro de $0, los dos
-- abiertos. Ninguna de las dos diferencias es la verdad: la única que vale es
-- la del último conteo, porque el anterior ya quedó viejo.
--
-- Contar dos veces no es un error del usuario —uno cuenta, se equivoca y vuelve
-- a contar—, así que lo que corresponde es que el nuevo reemplace al viejo y no
-- prohibir el segundo.

-- 'superseded': se cerró porque alguien volvió a contar, no porque se haya
-- explicado ni ajustado la diferencia. Distinguirlo importa: en el historial,
-- "lo reemplazó otro conteo" no es lo mismo que "alguien lo revisó".
ALTER TABLE public.wallet_reconciliations
    DROP CONSTRAINT IF EXISTS wallet_reconciliations_resolution_check;

ALTER TABLE public.wallet_reconciliations
    ADD CONSTRAINT wallet_reconciliations_resolution_check
    CHECK (resolution = ANY (ARRAY['adjusted'::text, 'explained'::text, 'superseded'::text]));

CREATE OR REPLACE FUNCTION public.record_reconciliation(
    w uuid,
    counted numeric,
    at_time timestamptz DEFAULT now(),
    note_text text DEFAULT NULL::text
)
RETURNS public.wallet_reconciliations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
$function$;

-- Los dos que ya quedaron abiertos en Samurai: sobrevive el último.
UPDATE public.wallet_reconciliations r
   SET status = 'resolved',
       resolution = 'superseded'
 WHERE r.status = 'pending'
   AND EXISTS (
       SELECT 1 FROM public.wallet_reconciliations mas_nuevo
        WHERE mas_nuevo.wallet_id = r.wallet_id
          AND mas_nuevo.status = 'pending'
          AND mas_nuevo.deleted_at IS NULL
          AND mas_nuevo.counted_at > r.counted_at
   );
