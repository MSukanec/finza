-- 029 · Huella de movimiento y lotes de importación con identidad propia
--
-- Dos cosas que el importador necesitaba y no tenía:
--
-- 1. Una HUELLA por movimiento, para reconocer que una fila ya fue importada.
--    Hasta ahora se calculaba en memoria contra lo que el store hubiera traído:
--    servía dentro de una sesión, pero no era una verdad de la base.
--
-- 2. Una tabla de LOTES. El lote era una cadena suelta en `import_batch`
--    (`batch_1775432100000_ab12cd34`), sin nombre de archivo, sin origen y sin
--    conteos, y listarlos obligaba a leer las 1500 transacciones del espacio
--    para agrupar en el cliente.
--
-- La huella la calcula un TRIGGER y no la aplicación, a propósito: la columna
-- `status` y `import_batch` ya demostraron que lo que depende de que alguien se
-- acuerde de completarlo, tarde o temprano queda vacío. `scripts/check-huellas.mjs`
-- verifica que la definición de acá y la de `src/lib/import` no se separen.

-- ------------------------------------------------------------ 1. Normalizar

/**
 * Forma canónica de un texto para comparar. Espejo de `normalizar()` en
 * src/lib/import/values.ts.
 *
 * Usa `translate` en vez de la extensión `unaccent` porque unaccent es STABLE,
 * no IMMUTABLE —depende de un diccionario cargable— y porque los acentos que
 * aparecen acá son los del alfabeto latino y se conocen de antemano. El último
 * carácter del mapa de origen (el BOM) no tiene equivalente en el destino, así
 * que translate lo borra.
 */
CREATE OR REPLACE FUNCTION public.normalizar_texto(t text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
    SELECT btrim(regexp_replace(
        translate(
            lower(coalesce(t, '')),
            'áàäâãéèëêíìïîóòöôõúùüûñç' || chr(65279),
            'aaaaaeeeeiiiiooooouuuunc'
        ),
        '\s+', ' ', 'g'
    ))
$$;

-- ------------------------------------------------------------ 2. Huella

/**
 * Identidad de un movimiento en el mundo real, con independencia del archivo
 * del que vino: día, monto, billetera, tipo y detalle normalizado.
 *
 * Va la billetera por ID y no por nombre: si mañana se renombra "Efectivo" a
 * "Caja", las huellas ya guardadas seguirían apuntando al nombre viejo y toda
 * fila nueva de esa billetera parecería nueva.
 *
 * El monto va en valor absoluto porque el signo lo lleva el tipo: la pata
 * entrante de una transferencia se guarda negativa (ver DB/schema y
 * `wallet_expected_balance`), y no por eso es otro movimiento.
 */
CREATE OR REPLACE FUNCTION public.transaction_fingerprint(
    p_wallet      uuid,
    p_date        timestamptz,
    p_amount      numeric,
    p_type        text,
    p_description text
)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
    SELECT concat_ws('|',
        to_char(p_date AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
        to_char(abs(p_amount), 'FM9999999999990.00'),
        coalesce(p_wallet::text, ''),
        p_type,
        public.normalizar_texto(p_description)
    )
$$;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS fingerprint text;

-- Backfill con los triggers apagados: `log_activity` dejaría 2540 entradas de
-- autor desconocido en el historial y `handle_updated_at` pisaría el
-- `updated_at` de cada movimiento con la fecha de esta migración.
ALTER TABLE public.transactions DISABLE TRIGGER log_activity_transactions;
ALTER TABLE public.transactions DISABLE TRIGGER set_updated_at_transactions;

UPDATE public.transactions
   SET fingerprint = public.transaction_fingerprint(wallet_id, date, amount, type::text, description)
 WHERE fingerprint IS DISTINCT FROM
       public.transaction_fingerprint(wallet_id, date, amount, type::text, description);

ALTER TABLE public.transactions ENABLE TRIGGER log_activity_transactions;
ALTER TABLE public.transactions ENABLE TRIGGER set_updated_at_transactions;

CREATE OR REPLACE FUNCTION public.set_transaction_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.fingerprint := public.transaction_fingerprint(
        NEW.wallet_id, NEW.date, NEW.amount, NEW.type::text, NEW.description
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_fingerprint ON public.transactions;
CREATE TRIGGER transactions_fingerprint
    BEFORE INSERT OR UPDATE OF wallet_id, date, amount, type, description
    ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_transaction_fingerprint();

-- No es UNIQUE: hoy hay 14 grupos de movimientos repetidos cargados de antes, y
-- un índice único no se puede crear sin borrarlos primero. Eso es una decisión
-- sobre datos reales, no algo que resuelva una migración.
CREATE INDEX IF NOT EXISTS transactions_huella_idx
    ON public.transactions (workspace_id, fingerprint)
    WHERE deleted_at IS NULL;

-- ------------------------------------------------------------ 3. Lotes

CREATE TABLE IF NOT EXISTS public.import_batches (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES public.users(id),

    -- Qué adaptador leyó el archivo: planilla, visa, mercadopago… Es el gancho
    -- para que las reglas de mapeo puedan ser distintas según el origen.
    source        text NOT NULL DEFAULT 'planilla',

    file_name     text,
    encoding      text,
    delimiter     text,

    rows_read     integer NOT NULL DEFAULT 0,
    rows_imported integer NOT NULL DEFAULT 0,
    rows_skipped  integer NOT NULL DEFAULT 0,

    created_at    timestamptz NOT NULL DEFAULT now(),
    reverted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS import_batches_espacio_idx
    ON public.import_batches (workspace_id, created_at DESC);

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_lote_idx
    ON public.transactions (import_batch_id) WHERE import_batch_id IS NOT NULL;

-- Los lotes viejos: una fila por cada `import_batch` de texto que ya existe, con
-- el usuario y la fecha que se puedan deducir de sus propios movimientos. La
-- columna de texto se conserva; es el único registro de cómo se llamaban.
ALTER TABLE public.transactions DISABLE TRIGGER log_activity_transactions;
ALTER TABLE public.transactions DISABLE TRIGGER set_updated_at_transactions;

WITH viejos AS (
    SELECT t.workspace_id,
           t.import_batch,
           -- No hay min() para uuid: se toma el autor del movimiento más viejo.
           (array_agg(t.user_id ORDER BY t.created_at))[1] AS user_id,
           min(t.created_at) AS created_at,
           count(*)          AS filas
      FROM public.transactions t
     WHERE t.import_batch IS NOT NULL
       AND t.import_batch_id IS NULL
     GROUP BY t.workspace_id, t.import_batch
), creados AS (
    INSERT INTO public.import_batches
        (workspace_id, user_id, source, file_name, rows_read, rows_imported, created_at)
    SELECT v.workspace_id,
           v.user_id,
           'planilla',
           v.import_batch,
           v.filas,
           v.filas,
           v.created_at
      FROM viejos v
    RETURNING id, workspace_id, file_name
)
UPDATE public.transactions t
   SET import_batch_id = c.id
  FROM creados c
 WHERE t.workspace_id = c.workspace_id
   AND t.import_batch = c.file_name
   AND t.import_batch_id IS NULL;

ALTER TABLE public.transactions ENABLE TRIGGER log_activity_transactions;
ALTER TABLE public.transactions ENABLE TRIGGER set_updated_at_transactions;

-- ------------------------------------------------------------ 4. RLS

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_batches_select ON public.import_batches;
DROP POLICY IF EXISTS import_batches_insert ON public.import_batches;
DROP POLICY IF EXISTS import_batches_update ON public.import_batches;

-- Misma regla que el resto de las tablas de datos: la membresía del espacio
-- decide, nunca el estado de la fila (ver DB/014).
CREATE POLICY import_batches_select ON public.import_batches
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

CREATE POLICY import_batches_insert ON public.import_batches
    FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY import_batches_update ON public.import_batches
    FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

GRANT SELECT, INSERT, UPDATE ON public.import_batches TO authenticated;
