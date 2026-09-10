-- 039 · Quién está conectado, sólo para los del espacio
--
-- La presencia manda tu nombre y tu foto por un canal de Realtime. Eso es
-- identidad, así que el canal tiene que estar cerrado igual que las tablas: si
-- fuera abierto, cualquiera que conociera el uuid de un espacio podría
-- escuchar quién trabaja ahí y cuándo.
--
-- Supabase resuelve esto con RLS sobre `realtime.messages` para los canales
-- marcados como privados. Hoy esa tabla tiene RLS prendido y CERO políticas, o
-- sea que todo canal privado está denegado. Esta política abre exactamente uno:
-- el de presencia de un espacio, y sólo a sus miembros.
--
-- El nombre del canal es `presencia:<uuid del espacio>`.

/**
 * El uuid del espacio que hay en el nombre del canal, o NULL si el canal no es
 * de presencia o el uuid está mal formado.
 *
 * Se valida el formato antes de convertir: sin esto, un canal llamado
 * "presencia:cualquier-cosa" haría fallar el cast y la política entera.
 */
CREATE OR REPLACE FUNCTION public.espacio_del_canal(canal text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN canal ~ '^presencia:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN substring(canal from 11)::uuid
    END
$$;

DROP POLICY IF EXISTS presencia_leer ON realtime.messages;
DROP POLICY IF EXISTS presencia_escribir ON realtime.messages;

-- Recibir la presencia de los demás.
CREATE POLICY presencia_leer ON realtime.messages
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(public.espacio_del_canal(realtime.topic())));

-- Anunciar la propia. Sin esto se podría mirar sin aparecer.
CREATE POLICY presencia_escribir ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(public.espacio_del_canal(realtime.topic())));
