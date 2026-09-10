-- 032 · Deshacer el vaciado del espacio Principal (DB/031)
--
-- El plan cambió: Mercado Pago sólo deja bajar de a tres meses, así que rehacer
-- dos años y medio desde las fuentes no es viable. Se recupera todo lo que
-- había y la puesta al día se hace conciliando desde ahí.
--
-- Que esto sea posible es la razón por la que la 031 borró de forma lógica y no
-- con DELETE.
--
-- El espacio va por UUID y no por nombre: hay cuatro espacios llamados
-- "Principal" y tres son de otras personas.

-- Mantenimiento, no la acción de una persona: sin esto el historial del espacio
-- queda con 1504 entradas de autor desconocido y se pisa el `updated_at` de
-- cada movimiento.
ALTER TABLE public.transactions DISABLE TRIGGER log_activity_transactions;
ALTER TABLE public.transactions DISABLE TRIGGER set_updated_at_transactions;
ALTER TABLE public.wallets DISABLE TRIGGER log_activity_wallets;
ALTER TABLE public.wallets DISABLE TRIGGER set_updated_at_wallets;

-- Se revive exactamente la tanda que borró la 031, reconocible porque comparte
-- el `deleted_at` al microsegundo. Cualquier movimiento que ya estuviera dado
-- de baja de antes se queda como estaba.
UPDATE public.transactions
   SET deleted_at = NULL
 WHERE workspace_id = '53589a55-90f6-466c-b065-b45c7630289e'
   AND deleted_at = (
        SELECT max(deleted_at) FROM public.transactions
         WHERE workspace_id = '53589a55-90f6-466c-b065-b45c7630289e'
       );

-- Los saldos iniciales, tal como los dejó anotados la 031.
UPDATE public.wallets AS wa
   SET initial_balance = v.saldo
  FROM (VALUES
        ('c103792f-a4f6-4eff-a54c-f61c8b12551b'::uuid, 219747::numeric),  -- Banco Galicia ARS
        ('cfca4e98-64ab-4b94-a1ce-9f48db0c21f9'::uuid,   2217::numeric),  -- Banco Patagonia ARS
        ('ce498c19-155d-46c6-8b65-33f3d86d18ca'::uuid,    320::numeric),  -- Binance USD
        ('032f1e50-47da-4c57-9a8a-77a5a204f2da'::uuid,    200::numeric),  -- Efectivo USD
        ('a91e9468-8e38-45d5-af5f-7d639149a1cf'::uuid, 210000::numeric),  -- Efectivo ARS
        ('446bf2cf-5ade-4e56-9b27-12ad4e83723d'::uuid, 114288::numeric),  -- Lemon Cash ARS
        ('5b553a3e-797c-4b94-899f-bdc7fe6703fa'::uuid,  76600::numeric),  -- Mercado Pago ARS
        ('d088ffb2-6aec-41ce-b240-a95146ae972b'::uuid,     83::numeric),  -- Payoneer USD
        ('4511f929-3dfc-4241-a744-6a0feacccb56'::uuid,   3183::numeric)   -- PayPal USD
       ) AS v(id, saldo)
 WHERE wa.id = v.id;

ALTER TABLE public.transactions ENABLE TRIGGER log_activity_transactions;
ALTER TABLE public.transactions ENABLE TRIGGER set_updated_at_transactions;
ALTER TABLE public.wallets ENABLE TRIGGER log_activity_wallets;
ALTER TABLE public.wallets ENABLE TRIGGER set_updated_at_wallets;

-- Los lotes vuelven a contar como importaciones vigentes.
UPDATE public.import_batches
   SET reverted_at = NULL
 WHERE workspace_id = '53589a55-90f6-466c-b065-b45c7630289e';
