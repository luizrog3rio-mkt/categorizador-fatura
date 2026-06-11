-- Adiciona total_amount a hotmart_sales: VALOR TOTAL pago pelo comprador
-- (purchase.price.value da API — inclui juros de parcelamento), separado do
-- gross_amount (BRUTO = purchase.hotmart_fee.base, preço do produto sem juros).
-- Verdade de campo confirmada contra 1600 vendas reais (601 parceladas, 37,5%).
--
-- Backfill inicial: total_amount := gross_amount (na época gross guardava o
-- price.value). O re-sync posterior (hotmart-sync v9) regravou gross com a base
-- correta e total com o price.value, deixando as duas colunas certas.
--
-- APLICADA: 2026-06-11 (version 20260611143617)

alter table public.hotmart_sales
  add column total_amount numeric not null default 0;

update public.hotmart_sales set total_amount = gross_amount;
