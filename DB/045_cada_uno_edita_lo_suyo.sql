-- 045 · Cada uno edita lo suyo
--
-- Regla decidida con el usuario el 2026-09-17:
--
--   VER un movimiento y sus comprobantes  →  lo que ya decía DB/034: el
--                                            administrador y los miembros ven
--                                            todo el espacio; el colaborador,
--                                            lo que cargó él.
--   CAMBIAR un movimiento                 →  SÓLO quien lo cargó. Editarlo,
--                                            borrarlo, adjuntarle o quitarle
--                                            un comprobante. Da igual el rol:
--                                            el administrador tampoco toca lo
--                                            que cargó un socio o la encargada.
--
-- Antes, `transactions_update` y `transactions_delete` usaban la misma
-- condición que la lectura, así que cualquiera que viera un movimiento podía
-- cambiarlo. Ver y cambiar son dos preguntas distintas y ahora tienen dos
-- respuestas distintas.
--
-- Lo que NO es "cambiar un movimiento de otro" y sigue pudiéndose: reordenar el
-- plan de categorías. Borrar una categoría pasando sus movimientos a otra toca
-- movimientos de todos, pero es una decisión sobre la estructura del espacio,
-- no sobre el contenido de un movimiento. Va por una función con su propia
-- guardia (abajo).

-- ---------------------------------------------------------------- movimientos

DROP POLICY IF EXISTS transactions_update ON public.transactions;
CREATE POLICY transactions_update ON public.transactions
    FOR UPDATE TO authenticated
    USING      (public.is_workspace_member(workspace_id) AND user_id = public.current_user_id())
    WITH CHECK (public.is_workspace_member(workspace_id) AND user_id = public.current_user_id());

DROP POLICY IF EXISTS transactions_delete ON public.transactions;
CREATE POLICY transactions_delete ON public.transactions
    FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id) AND user_id = public.current_user_id());

-- `transactions_select` y `transactions_insert` no cambian.

-- ---------------------------------------------------------------- comprobantes
--
-- Leer sigue igual que en DB/044: se ve lo del movimiento visible. Escribir pasa
-- a exigir que el movimiento sea PROPIO. La subconsulta sigue pasando por la RLS
-- de `transactions`, y además pregunta por el autor.

DROP POLICY IF EXISTS adjuntos_insert ON public.transaction_attachments;
CREATE POLICY adjuntos_insert ON public.transaction_attachments
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.transactions t
             WHERE t.id = transaction_id
               AND t.user_id = public.current_user_id()
        )
        AND user_id = public.current_user_id()
        AND storage_path LIKE workspace_id::text || '/' || transaction_id::text || '/%'
    );

DROP POLICY IF EXISTS adjuntos_update ON public.transaction_attachments;
CREATE POLICY adjuntos_update ON public.transaction_attachments
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.transactions t
             WHERE t.id = transaction_id
               AND t.user_id = public.current_user_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.transactions t
             WHERE t.id = transaction_id
               AND t.user_id = public.current_user_id()
        )
    );

DROP POLICY IF EXISTS adjuntos_subir ON storage.objects;
CREATE POLICY adjuntos_subir ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'adjuntos'
        AND EXISTS (
            SELECT 1 FROM public.transactions t
             WHERE t.id = public.movimiento_del_archivo(name)
               AND t.workspace_id = public.espacio_del_archivo(name)
               AND t.user_id = public.current_user_id()
        )
    );

-- `adjuntos_leer` y `adjuntos_select` no cambian: quien ve el movimiento, ve y
-- descarga sus comprobantes, los haya subido quien los haya subido.

-- ---------------------------------------------------------------- categorías

/**
 * Pasa todos los movimientos de una categoría a otra, de quien sean.
 *
 * Es lo que hace "borrar categoría y mover sus movimientos". Con la regla de
 * arriba, el UPDATE directo desde la app movería sólo los movimientos propios y
 * dejaría los de los demás colgados de una categoría borrada, sin error — que
 * es la peor forma de fallar.
 *
 * SECURITY DEFINER porque tiene que tocar filas ajenas. Por eso mismo la
 * guardia es la de administrar categorías (`can_see_all`, igual que
 * `categories_update`), y las dos categorías tienen que ser del mismo espacio:
 * sin eso, alguien podría vaciar una categoría de otro espacio hacia la suya.
 *
 * Sólo cambia `category_id`. No puede tocar montos, fechas ni nada más.
 */
CREATE OR REPLACE FUNCTION public.transferir_categoria(origen uuid, destino uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.transferir_categoria(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.transferir_categoria(uuid, uuid) TO authenticated;
