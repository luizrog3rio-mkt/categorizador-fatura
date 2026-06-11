-- entries.issue_date deixa de ser obrigatória (data de emissão opcional em
-- Contas a Pagar/Receber). O front passa a mandar null quando em branco; o
-- fluxo segue por due_date/payment_date, que continuam obrigatórios no form.
--
-- APLICADA: 2026-06-11 (version 20260611180441)

alter table public.entries alter column issue_date drop not null;
