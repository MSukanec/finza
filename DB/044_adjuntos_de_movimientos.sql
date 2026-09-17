-- 044 · Adjuntos de los movimientos
--
-- El ticket, la factura, el comprobante de la transferencia. Uno o varios por
-- movimiento, de cualquier tipo: ingreso, egreso, transferencia, aporte, retiro.
--
-- La regla de toda la migración es una sola: QUIEN VE EL MOVIMIENTO VE SUS
-- ADJUNTOS, y nadie más. No se escribe una regla nueva de permisos: cada
-- política pregunta si el movimiento existe, y esa pregunta ya pasa por la RLS
-- de `transactions` de quien consulta. Así el colaborador ve los comprobantes
-- de lo que cargó él y ningún otro, sin repetir `can_see_all` acá, y sin que
-- pueda quedar desincronizado si esa regla cambia.

-- ---------------------------------------------------------------- El bucket
--
-- PRIVADO, a diferencia de `logos`. Una factura dice a quién se le compra y
-- cuánto: una URL pública es una URL que alguien reenvía. Se descarga con una
-- URL firmada que vence en un minuto.
--
-- Tamaño y tipos se declaran acá y no sólo en la app: el cliente puede subir
-- sin pasar por el formulario.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'adjuntos', 'adjuntos', false,
    26214400,  -- 25 MB. Un PDF de AFIP pesa 50 KB; una foto de iPhone, 3 MB.
    ARRAY[
        'image/*',
        'application/pdf',
        'text/plain', 'text/csv', 'text/xml', 'application/xml',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip'
    ]
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

/**
 * El movimiento al que pertenece un archivo, según su ruta.
 *
 * La convención es `<espacio>/<movimiento>/<adjunto>-<nombre>`. Igual que
 * `espacio_del_archivo`, valida antes de convertir: una carpeta con cualquier
 * nombre haría fallar el cast y con él la política entera.
 */
CREATE OR REPLACE FUNCTION public.movimiento_del_archivo(ruta text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN split_part(ruta, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN split_part(ruta, '/', 2)::uuid
    END
$$;

DROP POLICY IF EXISTS adjuntos_leer ON storage.objects;
DROP POLICY IF EXISTS adjuntos_subir ON storage.objects;

-- Leer y subir: el movimiento tiene que existir PARA QUIEN PREGUNTA, y la
-- carpeta del espacio tiene que ser la del movimiento. Sin la segunda
-- condición, alguien podría guardar un archivo bajo la carpeta de otro espacio
-- apuntando a un movimiento propio.
CREATE POLICY adjuntos_leer ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'adjuntos'
        AND EXISTS (
            SELECT 1 FROM public.transactions t
             WHERE t.id = public.movimiento_del_archivo(name)
               AND t.workspace_id = public.espacio_del_archivo(name)
        )
    );

CREATE POLICY adjuntos_subir ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'adjuntos'
        AND EXISTS (
            SELECT 1 FROM public.transactions t
             WHERE t.id = public.movimiento_del_archivo(name)
               AND t.workspace_id = public.espacio_del_archivo(name)
        )
    );

-- Sin política de UPDATE ni de DELETE, a propósito: un comprobante subido no se
-- pisa ni se borra desde la app. Quitarlo de un movimiento es un borrado lógico
-- en la tabla; el archivo queda, y con él la posibilidad de recuperarlo.

-- ---------------------------------------------------------------- La tabla

CREATE TABLE IF NOT EXISTS public.transaction_attachments (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    storage_path   text NOT NULL UNIQUE,
    file_name      text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
    mime_type      text,
    size_bytes     bigint NOT NULL CHECK (size_bytes >= 0),
    user_id        uuid NOT NULL REFERENCES public.users(id),
    created_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz
);

COMMENT ON TABLE public.transaction_attachments IS
    'Comprobantes de un movimiento. El archivo vive en el bucket privado `adjuntos`; acá, qué es y de quién.';

CREATE INDEX IF NOT EXISTS transaction_attachments_tx_idx
    ON public.transaction_attachments (transaction_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transaction_attachments_ws_idx
    ON public.transaction_attachments (workspace_id) WHERE deleted_at IS NULL;

/**
 * Lo que la base completa sola en vez de creerle al cliente.
 *
 * - `workspace_id` sale del movimiento. Si lo mandara el cliente, podría
 *   declarar un espacio y colgar el adjunto de un movimiento de otro.
 * - `user_id` es quien sube, siempre. Mismo criterio que el autor de un
 *   movimiento: no se elige.
 */
CREATE OR REPLACE FUNCTION public.completar_adjunto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    SELECT t.workspace_id INTO NEW.workspace_id
      FROM public.transactions t
     WHERE t.id = NEW.transaction_id;

    IF auth.uid() IS NOT NULL THEN
        NEW.user_id := public.current_user_id();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS completar_adjunto ON public.transaction_attachments;
CREATE TRIGGER completar_adjunto
    BEFORE INSERT ON public.transaction_attachments
    FOR EACH ROW EXECUTE FUNCTION public.completar_adjunto();

ALTER TABLE public.transaction_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adjuntos_select ON public.transaction_attachments;
DROP POLICY IF EXISTS adjuntos_insert ON public.transaction_attachments;
DROP POLICY IF EXISTS adjuntos_update ON public.transaction_attachments;

-- La subconsulta pasa por la RLS de `transactions` de quien consulta: ése es
-- todo el permiso. Ver el encabezado.
CREATE POLICY adjuntos_select ON public.transaction_attachments
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id));

-- Además, la fila tiene que apuntar al archivo de ESE movimiento en ESE
-- espacio. Si no, se podría registrar un adjunto propio que señale el archivo
-- de otro y leerlo con una URL firmada.
CREATE POLICY adjuntos_insert ON public.transaction_attachments
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id)
        AND user_id = public.current_user_id()
        AND storage_path LIKE workspace_id::text || '/' || transaction_id::text || '/%'
    );

CREATE POLICY adjuntos_update ON public.transaction_attachments
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id))
    WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id));

-- De una fila existente sólo se puede tocar `deleted_at`. Sin esto, el UPDATE
-- permitiría mover un adjunto a otro movimiento o cambiarle la ruta del archivo.
REVOKE UPDATE ON public.transaction_attachments FROM authenticated, anon;
GRANT UPDATE (deleted_at) ON public.transaction_attachments TO authenticated;

-- Sin DELETE: el borrado es lógico, como el de los movimientos.
REVOKE DELETE ON public.transaction_attachments FROM authenticated, anon;
