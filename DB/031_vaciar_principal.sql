-- 031 · Vaciar el espacio Principal para recargarlo desde las fuentes reales
--
-- Pedido explícito del usuario el 2026-09-10: dejar el espacio personal en cero
-- y volver a cargarlo billetera por billetera desde los archivos de cada banco.
-- El histórico que había era bueno hasta agosto 2025 y después se fue quedando
-- flaco, con tapones de "CONCILIACION INICIO DE CAJA" cargados a mano para que
-- las cajas dieran. Antes que arrastrar eso, se rehace.
--
-- ALCANCE: SÓLO el espacio Principal. Samurai y Pruebas no se tocan.
--
-- Qué se borra:   los 1504 movimientos y el saldo inicial de las 9 billeteras
--                 que lo tenían distinto de cero.
-- Qué NO se toca: las 66 categorías, sus grupos, las 11 billeteras (siguen
--                 existiendo, con saldo inicial en cero) y la única deuda
--                 cargada, que el usuario no pidió borrar.
--
-- El borrado es LÓGICO: las filas quedan con `deleted_at`, invisibles para la
-- app y para el importador, pero recuperables. No se usa DELETE porque son
-- 1504 movimientos reales de dos años y medio, y un error acá no tiene vuelta.
--
-- ============================ CÓMO DESHACER ESTO ============================
-- Los movimientos vuelven con:
--
--   UPDATE public.transactions t SET deleted_at = NULL
--     FROM public.workspaces w
--    WHERE w.id = t.workspace_id AND w.name = 'Principal'
--      AND t.deleted_at = (SELECT max(deleted_at) FROM public.transactions);
--
-- Y los saldos iniciales eran estos (id de billetera → saldo):
--   c103792f-a4f6-4eff-a54c-f61c8b12551b  Banco Galicia   ARS  219747
--   cfca4e98-64ab-4b94-a1ce-9f48db0c21f9  Banco Patagonia ARS    2217
--   ce498c19-155d-46c6-8b65-33f3d86d18ca  Binance         USD     320
--   032f1e50-47da-4c57-9a8a-77a5a204f2da  Efectivo        USD     200
--   a91e9468-8e38-45d5-af5f-7d639149a1cf  Efectivo        ARS  210000
--   446bf2cf-5ade-4e56-9b27-12ad4e83723d  Lemon Cash      ARS  114288
--   5b553a3e-797c-4b94-899f-bdc7fe6703fa  Mercado Pago    ARS   76600
--   d088ffb2-6aec-41ce-b240-a95146ae972b  Payoneer        USD      83
--   4511f929-3dfc-4241-a744-6a0feacccb56  PayPal          USD    3183
-- ============================================================================

-- Los triggers se apagan porque esto es mantenimiento, no la acción de una
-- persona: dejarían 1504 entradas de autor desconocido en el historial del
-- espacio y pisarían el `updated_at` de cada movimiento.
ALTER TABLE public.transactions DISABLE TRIGGER log_activity_transactions;
ALTER TABLE public.transactions DISABLE TRIGGER set_updated_at_transactions;
ALTER TABLE public.wallets DISABLE TRIGGER log_activity_wallets;
ALTER TABLE public.wallets DISABLE TRIGGER set_updated_at_wallets;

UPDATE public.transactions t
   SET deleted_at = now()
  FROM public.workspaces w
 WHERE w.id = t.workspace_id
   AND w.name = 'Principal'
   AND t.deleted_at IS NULL;

UPDATE public.wallets wa
   SET initial_balance = 0
  FROM public.workspaces w
 WHERE w.id = wa.workspace_id
   AND w.name = 'Principal'
   AND wa.initial_balance <> 0;

ALTER TABLE public.transactions ENABLE TRIGGER log_activity_transactions;
ALTER TABLE public.transactions ENABLE TRIGGER set_updated_at_transactions;
ALTER TABLE public.wallets ENABLE TRIGGER log_activity_wallets;
ALTER TABLE public.wallets ENABLE TRIGGER set_updated_at_wallets;

-- Los lotes de aquella importación quedan marcados como deshechos: siguen
-- listados como algo que pasó, pero ya no cuentan movimientos vivos.
UPDATE public.import_batches b
   SET reverted_at = now()
  FROM public.workspaces w
 WHERE w.id = b.workspace_id
   AND w.name = 'Principal'
   AND b.reverted_at IS NULL;
