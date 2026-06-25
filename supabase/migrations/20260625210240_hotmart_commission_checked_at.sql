-- ============================================================================
-- Coluna de rodízio pro preenchimento de comissões (afiliado/coprodução/líquido)
-- ----------------------------------------------------------------------------
-- A API /sales/commissions traz o que o /sales/history NÃO traz: valor de
-- afiliado/coprodução e o líquido EXATO (linha PRODUCER). O preenchimento é
-- dirigido pelo banco (modo refresh_commissions da Edge Function hotmart-sync),
-- consultando a API 1 a 1 por ?transaction=<id>. Esta coluna espelha o
-- status_checked_at já existente: NULL = nunca checada (prioridade no backfill);
-- carimbada a cada checagem (rodízio NULLS FIRST). Read-only de dados.
--
-- APLICADA: 2026-06-25 (version 20260625210240)
-- ============================================================================

alter table public.hotmart_sales
  add column commission_checked_at timestamptz;
