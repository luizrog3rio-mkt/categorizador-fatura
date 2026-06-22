-- ============================================================================
-- transactions.kind — débito/crédito (estornos e descontos da fatura)
-- ============================================================================
-- APLICADA em 2026-06-22 via MCP apply_migration — version vivo 20260622133542
-- (renomeado do placeholder 20260622000001, rito padrão). Pós-apply: 1321
-- transações backfilladas com kind='debit' (default), 0 créditos ainda.
--
-- Contexto: o parser de fatura de cartão (lib/fatura.ts) passou a importar os
-- créditos do OFX (estornos/descontos) em vez de descartá-los — eles ABATEM o
-- total da fatura. amount continua POSITIVO (magnitude); o sinal contábil vem
-- desta coluna. Decisão do Luiz em 2026-06-22 (desvia do contrato #3 antigo,
-- que descartava todo CREDIT). Ver header de lib/fatura.ts e CLAUDE.md.
--
-- O default 'debit' faz o backfill de TODAS as transações já existentes (todas
-- são despesas hoje — créditos eram descartados na importação), preservando o
-- comportamento atual. Adicionar coluna NOT NULL com default constante é
-- metadata-only no Postgres (não reescreve a tabela).
-- ============================================================================

alter table public.transactions
  add column kind text not null default 'debit'
  check (kind in ('debit', 'credit'));
