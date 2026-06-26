-- ============================================================================
-- Classificação dos lançamentos de cartão por Plano de Contas
-- ----------------------------------------------------------------------------
-- Coluna `transactions.chart_of_account_id` — a "marcação" de cada lançamento da
-- fatura numa conta do plano (chart_of_accounts), análoga ao `entries`. Alimenta
-- a DRE principal por competência (ver migration dre_by_competency_card).
-- `on delete set null`: apagar a conta não derruba o lançamento.
--
-- APLICADA: 2026-06-26 (version 20260626162350)
-- ============================================================================

alter table public.transactions
  add column chart_of_account_id uuid references public.chart_of_accounts(id) on delete set null;
create index idx_transactions_chart_of_account on public.transactions (chart_of_account_id);
