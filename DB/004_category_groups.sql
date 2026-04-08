-- ==============================================================================
-- 004: Category Groups Support
-- ==============================================================================

BEGIN;

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS group_name TEXT NOT NULL DEFAULT 'General';

COMMIT;
