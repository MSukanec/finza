-- 013_transactions_status.sql
-- ============================================================
-- Migracion RETROACTIVA (documental).
-- La columna `status` de transactions se agrego a mano en el SQL Editor de
-- Supabase y nunca tuvo archivo en DB/. Este script deja el repo alineado con
-- la base. Es idempotente: correrlo sobre la base actual no cambia nada.
--
-- Valores en uso (2026-09-10): draft (1435), reviewed (62), warning (7).
-- Tipado en src/lib/types.ts: 'draft' | 'warning' | 'reviewed'
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'draft';
