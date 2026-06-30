-- APLICADA: 20260630181831
-- Auditoria import/consistencia 2026-06-30: completude de datas (proxy = due_date).
-- 18 entries com conta mas competency E issue null somem da DRE (coalesce nao tem o que pegar) ->
-- competency=due_date recupera R$50.443. 149 entries pagas sem payment_date sao invisiveis no
-- fluxo de caixa/DRExCaixa por data -> payment_date=due_date (R$639.940 ganham data).
-- Aprovado pelo Luiz em 2026-06-30. (Premissa re-verificada: 95->18 reais; R$223k->R$50k.)
-- Verificado: 0 entries somem da DRE, 0 pagas sem payment_date apos o backfill.
update public.entries set competency_date = due_date
where chart_of_account_id is not null and competency_date is null and issue_date is null
  and status not in ('cancelled','refunded');
update public.entries set payment_date = due_date
where status='paid' and payment_date is null;
