-- 017_fix_workspace_insert_returning.sql
-- ============================================================
-- Arregla "new row violates row-level security policy for table workspaces"
-- al crear un espacio nuevo. 2026-09-10.
--
-- Causa (reproducida aislando el statement):
--   El store hace `.insert().select()`, que en SQL es INSERT ... RETURNING.
--   Postgres aplica la politica de SELECT a la fila devuelta. La politica que
--   dejo la migracion 015 pregunta is_workspace_member(id), pero la membresia
--   la crea el trigger AFTER INSERT `on_workspace_created`, que todavia no
--   corrio cuando se evalua el RETURNING. Resultado: el creador del espacio no
--   es miembro de el durante ese instante y el INSERT se rechaza.
--
--   Comprobado: `insert into workspaces ...` sin RETURNING pasa;
--   el mismo insert con `returning id, name` falla.
--
-- Correccion: la politica de SELECT reconoce ademas al dueño por `user_id`,
-- que es justamente la columna que marca quien lo creo. No afloja nada: quien
-- figura como user_id siempre termina siendo miembro owner igual.
-- ============================================================

DROP POLICY IF EXISTS workspaces_select ON public.workspaces;
CREATE POLICY workspaces_select ON public.workspaces
    FOR SELECT TO authenticated
    USING (
        user_id = public.current_user_id()
        OR public.is_workspace_member(id)
    );
