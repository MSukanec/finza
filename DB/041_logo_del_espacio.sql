-- 041 · Logo del espacio
--
-- El ícono de la barra lateral pasa a ser el del negocio. Con varios espacios
-- —un restaurante, las finanzas personales— el logo es lo que te dice de un
-- vistazo dónde estás parado antes de cargar algo en el lugar equivocado.

ALTER TABLE public.workspaces
    ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.workspaces.logo_url IS
    'URL pública del logo en el bucket `logos`. NULL usa el ícono por defecto.';

-- ---------------------------------------------------------------- El bucket
--
-- Público de LECTURA a propósito: un logo no es un secreto y así la imagen se
-- muestra con una URL común, sin firmarla ni renovarla cada hora. Lo que sí
-- está cerrado es quién puede escribir.
--
-- El límite de tamaño y los tipos permitidos se declaran acá y no sólo en el
-- formulario: el cliente puede subir sin pasar por la app.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'logos', 'logos', true,
    524288,  -- 512 KB. La app manda ~30 KB; esto es el techo, no lo esperado.
    ARRAY['image/webp', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------- Quién escribe

/**
 * El espacio al que pertenece un archivo del bucket, según su carpeta.
 *
 * La convención es `<uuid del espacio>/logo.webp`. Se valida el formato antes
 * de convertir: un archivo subido a una carpeta con cualquier nombre haría
 * fallar el cast y con él la política entera.
 */
CREATE OR REPLACE FUNCTION public.espacio_del_archivo(ruta text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN split_part(ruta, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN split_part(ruta, '/', 1)::uuid
    END
$$;

DROP POLICY IF EXISTS logos_escribir ON storage.objects;
DROP POLICY IF EXISTS logos_actualizar ON storage.objects;
DROP POLICY IF EXISTS logos_borrar ON storage.objects;

-- Sólo el dueño del espacio, y sólo dentro de la carpeta de SU espacio. Sin la
-- segunda condición, cualquier dueño podría pisar el logo de otro negocio.
CREATE POLICY logos_escribir ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'logos'
        AND public.is_workspace_owner(public.espacio_del_archivo(name))
    );

CREATE POLICY logos_actualizar ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'logos' AND public.is_workspace_owner(public.espacio_del_archivo(name)))
    WITH CHECK (bucket_id = 'logos' AND public.is_workspace_owner(public.espacio_del_archivo(name)));

-- Reemplazar un logo borra el anterior: acá el borrado es físico y no lógico
-- porque no es un dato del negocio, es un archivo que dejó de usarse.
CREATE POLICY logos_borrar ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'logos' AND public.is_workspace_owner(public.espacio_del_archivo(name)));
