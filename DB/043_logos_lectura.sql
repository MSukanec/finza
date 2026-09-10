-- 043 · Falta la política de lectura del bucket de logos
--
-- Subir un logo fallaba con "new row violates row-level security policy".
-- La política de escritura estaba bien: el INSERT simulado a mano pasaba.
--
-- Lo que faltaba era la de LECTURA. Sin ella, para el usuario autenticado no
-- existe ningún archivo del bucket, así que el `upsert` no encuentra el que va
-- a reemplazar, intenta insertar uno nuevo y choca con el que ya está. El error
-- habla de la escritura pero la causa es que no puede ver.
--
-- Que el bucket sea público no alcanza: eso sirve para servir la imagen por
-- URL, no para que la API la encuentre al reemplazarla.

DROP POLICY IF EXISTS logos_leer ON storage.objects;

-- Acotada a los miembros del espacio igual: la imagen se sirve pública por URL,
-- pero la lista de archivos no tiene por qué estarlo.
CREATE POLICY logos_leer ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'logos'
        AND public.is_workspace_member(public.espacio_del_archivo(name))
    );
