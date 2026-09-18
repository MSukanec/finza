-- 049 · El último espacio en el que estuvo cada persona
--
-- Pedido del usuario el 2026-09-18: si alguien cierra la app estando en
-- Samurai, al volver a abrirla tiene que seguir en Samurai.
--
-- Hasta acá se recordaba sólo en el localStorage del navegador, y eso fallaba
-- en tres casos reales:
--   - Cerrar sesión lo borraba a propósito, así que al volver a entrar se
--     arrancaba en el primer espacio de la lista.
--   - Otro dispositivo u otro navegador no sabía nada.
--   - La app instalada en el iPhone tiene su propio almacenamiento, y iOS lo
--     puede vaciar si no se usa por unos días.
--
-- La encargada de Samurai quedó cargando en su espacio "Principal" vacío (se
-- lo crea el alta, antes de aceptar la invitación) y veía "no tenés categorías".
--
-- Se guarda en la cuenta. Si el espacio se borra, el dato se vacía solo y la app
-- elige otro. No hace falta política nueva: cada persona ya puede actualizar su
-- propia fila de `users`, y apuntar a un espacio ajeno no da acceso a nada —la
-- app lo ignora si no es miembro, y la RLS no le mostraría sus datos igual—.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS last_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.last_workspace_id IS
    'Último espacio abierto. La app arranca ahí, en cualquier dispositivo y aunque se haya cerrado sesión.';
