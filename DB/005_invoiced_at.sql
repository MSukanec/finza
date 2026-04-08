-- ==============================================================================
-- 005: Transactions Invoiced At
-- ==============================================================================

BEGIN;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMP WITH TIME ZONE;

COMMIT;
