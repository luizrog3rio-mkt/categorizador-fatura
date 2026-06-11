-- hotmart_sales ganha dois campos vindos da API /sales/history:
--  - fee_percentage: % cobrada pela Hotmart (purchase.hotmart_fee.percentage).
--  - installments:   nº de parcelas da compra (purchase.payment.installments_number;
--    1 = à vista). Display-only; o re-sync posterior preenche o histórico.
--
-- APLICADA: 2026-06-11 (version 20260611173533)

alter table public.hotmart_sales
  add column fee_percentage numeric,
  add column installments  integer;
