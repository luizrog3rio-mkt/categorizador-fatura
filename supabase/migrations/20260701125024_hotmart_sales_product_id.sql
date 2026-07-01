-- ============================================================================
-- hotmart_sales.product_id — captura o ID numérico do produto Hotmart
-- ============================================================================
-- Fase 1.1 da reforma "produto por ID" (2026-07-01, pedido do Luiz).
-- APLICADA em 2026-07-01 — version 20260701125024.
--
-- Problema: hoje a receita Hotmart liga-se à DRE pela chave NOME do produto
-- (hotmart_product_map.product = hotmart_sales.product, ambos texto). Há
-- produtos homônimos com IDs diferentes — ex.: "Mentoria Apruma" tem 4 IDs
-- (4266862, 4803803, 6881442, 7070973) fundidos numa linha só (345 vendas,
-- R$2,7M) na tela e no mapeamento pra DRE. Ninguém consegue distinguir/separar.
--
-- Esta migration é ADITIVA e NÃO-DESTRUTIVA: só cria a coluna (nullable) + índice.
-- Nada lê essa coluna ainda; vendas antigas ficam null até o backfill (Fase 1.4,
-- edge hotmart-sync modo backfill_product_id). O id (7 dígitos) vem de
-- /sales/history (product.id) e do webhook (data.product.id). Vira a chave do
-- mapeamento e das RPCs de DRE na Fase 2. Reversível (drop column).
-- ============================================================================

alter table public.hotmart_sales
  add column if not exists product_id bigint;

comment on column public.hotmart_sales.product_id is
  'ID numérico do produto na Hotmart (product.id de /sales/history e data.product.id do webhook). Distingue produtos de mesmo nome. Backfill via edge hotmart-sync modo backfill_product_id.';

create index if not exists idx_hotmart_sales_product_id
  on public.hotmart_sales (product_id);
