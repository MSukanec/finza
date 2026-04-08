-- Adds the is_checkpoint column to the transactions table to support the visual divider feature
ALTER TABLE public.transactions 
ADD COLUMN is_checkpoint BOOLEAN NOT NULL DEFAULT false;
