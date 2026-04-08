-- ==============================================================================
-- 006: Soft Delete & Import Batches
-- ==============================================================================

BEGIN;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS import_batch TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Recreate SELECT policy to exclude soft-deleted items
DROP POLICY IF EXISTS "USERS SELECT OWN_TRANSACTIONS" ON public.transactions;
CREATE POLICY "USERS SELECT OWN_TRANSACTIONS" ON public.transactions FOR SELECT USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    AND deleted_at IS NULL
);

-- Recreate UPDATE policy to exclude soft-deleted items
DROP POLICY IF EXISTS "USERS UPDATE OWN_TRANSACTIONS" ON public.transactions;
CREATE POLICY "USERS UPDATE OWN_TRANSACTIONS" ON public.transactions FOR UPDATE USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    AND deleted_at IS NULL
);

COMMIT;
