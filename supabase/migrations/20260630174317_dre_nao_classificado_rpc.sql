-- APLICADA: 20260630174317
-- Auditoria import 2026-06-30: o cartao entra na DRE via transactions.chart_of_account_id, mas o
-- Alert "N lancamentos fora da DRE" da tela DRE so consultava entries -> 912 transactions de cartao
-- (R$584k, 82%) sem conta somiam da DRE E ficavam silenciosas no aviso (o CLAUDE.md afirmava
-- incorretamente que o alerta cobria entries+transactions). Esta RPC devolve o nao-classificado das
-- DUAS fontes (entries + cartao com valorComSinal), server-side (evita o teto de 1000 do PostgREST).
-- Aprovado pelo Luiz em 2026-06-30. Verificado: RB7 DIGITAL = entries 542/R$2,64M + tx 912/R$584k;
-- anon=false, authenticated=true.
create or replace function public.dre_nao_classificado(p_company uuid)
returns table(qtd_entries bigint, valor_entries numeric, qtd_tx bigint, valor_tx numeric)
language sql stable security definer set search_path to '' as $function$
  select
    (select count(*) from public.entries e where e.company_id=p_company and e.chart_of_account_id is null and e.status not in ('cancelled','refunded')),
    (select coalesce(sum(e.amount),0) from public.entries e where e.company_id=p_company and e.chart_of_account_id is null and e.status not in ('cancelled','refunded')),
    (select count(*) from public.transactions t join public.invoices i on i.id=t.invoice_id join public.accounts a on a.id=i.account_id where a.company_id=p_company and t.chart_of_account_id is null),
    (select coalesce(sum(case when t.kind='debit' then t.amount else -t.amount end),0) from public.transactions t join public.invoices i on i.id=t.invoice_id join public.accounts a on a.id=i.account_id where a.company_id=p_company and t.chart_of_account_id is null);
$function$;
revoke execute on function public.dre_nao_classificado(uuid) from public;
grant  execute on function public.dre_nao_classificado(uuid) to authenticated;
