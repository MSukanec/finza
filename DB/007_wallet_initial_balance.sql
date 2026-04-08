-- ==========================================
-- Migration 007: Wallet Initial Balance
-- ==========================================

-- Agregar columna 'initial_balance' a la tabla 'wallets'
ALTER TABLE public.wallets 
ADD COLUMN initial_balance NUMERIC NOT NULL DEFAULT 0;

-- Documentar el propósito
COMMENT ON COLUMN public.wallets.initial_balance IS 'Saldo patrimonial inicial al crear la billetera, útil para evitar volcar históricos completos y usar como punto de partida de la conciliación.';
