-- hotmart_sales ganha:
--  - currency: moeda da venda (price.currency_code da API). Vendas USD existem;
--    sem isso os KPIs somavam USD como BRL. Default 'BRL' nas linhas antigas; o
--    re-sync posterior grava a moeda real de cada venda.
--  - status_checked_at: marca da última re-checagem de status por transação
--    (rodízio do cron de refresh que captura reembolso/chargeback).
--
-- APLICADA: 2026-06-11 (version 20260611164005)

alter table public.hotmart_sales
  add column currency text not null default 'BRL',
  add column status_checked_at timestamptz;
