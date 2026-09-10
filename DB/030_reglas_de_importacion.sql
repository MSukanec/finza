-- 030 · Reglas de importación: que lo resuelto una vez quede resuelto
--
-- Hasta acá cada importación volvía a adivinar de cero. El emparejamiento por
-- parecido resuelve lo obvio, pero lo que NO es obvio —que "MERPAGO*UBER" es
-- Transporte, que "Efvo" es la billetera Efectivo— se resolvía a mano y se
-- olvidaba al instante. Al archivo siguiente, la misma pregunta otra vez.
--
-- Una regla es un hecho que alguien afirmó: "este texto significa esta
-- categoría". Se escribe sola cuando la persona decide en la pantalla de
-- importar, y desde entonces esa fila deja de preguntar. Lo que queda para
-- revisar es únicamente lo que ninguna regla cubre — que es exactamente lo que
-- se quiere ver cuando llega el resumen del mes.

CREATE TABLE IF NOT EXISTS public.import_rules (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES public.users(id),

    -- Qué parte de la fila mira la regla:
    --   categoria → el par CATEGORIA/SUBCATEGORIA de una planilla
    --   detalle   → la descripción libre, que es lo único que traen los
    --               resúmenes de tarjeta y los exports de billeteras
    --   billetera → el nombre de la cuenta o medio de pago
    field      text NOT NULL CHECK (field IN ('categoria', 'detalle', 'billetera')),

    -- Origen al que aplica. NULL vale para cualquiera. Sirve para que "cuota"
    -- signifique una cosa en el resumen de la tarjeta y otra en la planilla.
    source     text,

    -- `exact` compara el texto entero; `contains` alcanza con que aparezca.
    -- El detalle de un resumen casi nunca se repite igual ("UBER *TRIP 4821"),
    -- así que ahí lo que sirve es `contains`.
    match_type text NOT NULL DEFAULT 'exact' CHECK (match_type IN ('exact', 'contains')),

    -- El texto YA normalizado (minúsculas, sin acentos, espacios colapsados),
    -- con la misma función que usa el importador: public.normalizar_texto.
    pattern    text NOT NULL CHECK (length(btrim(pattern)) > 0),

    -- Sólo para reglas de categoría: una misma descripción es gasto en un lado
    -- e ingreso en otro ("transferencia recibida").
    type       text CHECK (type IN ('income', 'expense')),

    category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
    wallet_id   uuid REFERENCES public.wallets(id) ON DELETE CASCADE,

    -- Para saber cuáles ganan su lugar y cuáles nunca se usaron.
    hits         integer NOT NULL DEFAULT 0,
    last_used_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

-- Una regla apunta a una categoría o a una billetera, nunca a las dos ni a
-- ninguna: sin esto, una regla a medias se aplicaría sin hacer nada y sería
-- imposible darse cuenta de por qué la fila sigue sin resolverse.
ALTER TABLE public.import_rules DROP CONSTRAINT IF EXISTS import_rules_destino_unico;
ALTER TABLE public.import_rules ADD CONSTRAINT import_rules_destino_unico CHECK (
    (category_id IS NOT NULL AND wallet_id IS NULL AND field <> 'billetera')
 OR (wallet_id IS NOT NULL AND category_id IS NULL AND field = 'billetera')
);

-- El mismo texto no puede significar dos cosas distintas en el mismo espacio y
-- para el mismo origen. Al reaprender, se pisa la regla anterior.
CREATE UNIQUE INDEX IF NOT EXISTS import_rules_patron_uniq
    ON public.import_rules (workspace_id, field, coalesce(source, ''), coalesce(type, ''), pattern)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS import_rules_espacio_idx
    ON public.import_rules (workspace_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS import_rules_updated_at ON public.import_rules;
CREATE TRIGGER import_rules_updated_at
    BEFORE UPDATE ON public.import_rules
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Sin trigger de historial a propósito: una importación puede dejar cincuenta
-- reglas nuevas de una sentada y el historial del espacio es para los
-- movimientos, no para la plomería del importador.

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.import_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_rules_select ON public.import_rules;
DROP POLICY IF EXISTS import_rules_insert ON public.import_rules;
DROP POLICY IF EXISTS import_rules_update ON public.import_rules;

CREATE POLICY import_rules_select ON public.import_rules
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

CREATE POLICY import_rules_insert ON public.import_rules
    FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY import_rules_update ON public.import_rules
    FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

GRANT SELECT, INSERT, UPDATE ON public.import_rules TO authenticated;

-- ---------------------------------------------------------------- Aprender

/**
 * Guarda —o corrige— lo que alguien acaba de decidir en la pantalla de importar.
 *
 * Va como función y no como INSERT desde el cliente por el ON CONFLICT: el
 * índice único es parcial (`WHERE deleted_at IS NULL`) y PostgREST no sabe
 * apuntarle. Además normaliza el patrón acá, así no depende de que quien llame
 * se acuerde de hacerlo.
 */
CREATE OR REPLACE FUNCTION public.aprender_regla(
    ws          uuid,
    p_field     text,
    p_pattern   text,
    p_source    text DEFAULT NULL,
    p_type      text DEFAULT NULL,
    p_category  uuid DEFAULT NULL,
    p_wallet    uuid DEFAULT NULL,
    p_match     text DEFAULT 'exact'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pattern text := public.normalizar_texto(p_pattern);
    v_id      uuid;
BEGIN
    IF NOT public.is_workspace_member(ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
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
$$;

REVOKE ALL ON FUNCTION public.aprender_regla(uuid, text, text, text, text, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.aprender_regla(uuid, text, text, text, text, uuid, uuid, text) TO authenticated;

/**
 * Anota que un puñado de reglas se usó. Una sola llamada por importación, en vez
 * de una por fila: en un archivo de mil filas la misma regla se aplica cientos
 * de veces y no tiene sentido escribir cientos de updates.
 */
CREATE OR REPLACE FUNCTION public.registrar_uso_reglas(ws uuid, ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_workspace_member(ws) THEN
        RAISE EXCEPTION 'No sos miembro de este espacio';
    END IF;

    UPDATE public.import_rules
       SET hits = hits + 1, last_used_at = now()
     WHERE workspace_id = ws AND id = ANY(ids);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_uso_reglas(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_uso_reglas(uuid, uuid[]) TO authenticated;
