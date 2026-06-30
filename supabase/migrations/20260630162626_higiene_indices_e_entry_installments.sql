-- APLICADA: 20260630162626
-- Auditoria 4 trilhas 2026-06-30 (higiene). 6 indices com idx_scan=0 (nunca usados) -> dropar
-- reduz overhead de escrita (esp. entry_audit_log, write-heavy) + storage; reversiveis. E a tabela
-- entry_installments (scaffolding de "parcelamento de lancamentos" nunca implementado): 0 linhas,
-- 0 FK apontando, 0 funcoes/frontend usam -> dropada (Luiz confirmou que nao esta no roadmap;
-- reversivel se um dia entrar). Aprovado pelo Luiz em 2026-06-30. Verificado: 0 indices restantes,
-- tabela removida. (idx_entry_installments_entry caiu junto com a tabela.)
drop index if exists public.idx_purchase_items_user;
drop index if exists public.idx_invoices_account;
drop index if exists public.idx_entries_competency_date;
drop index if exists public.idx_entry_audit_log_entry;
drop index if exists public.idx_entry_audit_log_changed_at;
drop table if exists public.entry_installments;
