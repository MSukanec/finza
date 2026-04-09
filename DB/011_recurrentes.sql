-- 011_recurrentes.sql
-- Add is_recurring to categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;

-- Add period_month to transactions (format YYYY-MM)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS period_month VARCHAR(7);
