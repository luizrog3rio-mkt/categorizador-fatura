-- ============================================================================
-- DRE por competência: une os lançamentos de CARTÃO classificados
-- ----------------------------------------------------------------------------
-- A `dre_by_competency` passa a somar, além dos `entries`, as `transactions`
-- (cartão) que tiverem `chart_of_account_id`. Decisões:
--  - competência do cartão = DATA DA COMPRA (`transactions.date`, 'DD/MM/YYYY')
--  - empresa via fatura→conta (`invoices.account_id` → `accounts.company_id`)
--  - sinal pelo `kind` (débito SOMA a despesa; crédito/estorno ABATE)
--  - guarda anti-dupla-contagem: exclui `entries` que são a FATURA agregada do
--    cartão (`invoice_account_id` preenchido) — o cartão agora entra itemizado.
--    Hoje há 0 desses entries, então sem impacto retroativo; fica blindado.
-- Escopo: SÓ esta RPC (a DRE principal). NÃO toca `dre_by_product` (cartão não
-- tem produto) nem `dre_cash_reconciliation` (compara com caixa — divergiria).
-- Mantém SECURITY DEFINER, search_path='' e grants (CREATE OR REPLACE preserva).
--
-- APLICADA: 2026-06-26 (version 20260626162413)
-- ============================================================================

create or replace function public.dre_by_competency(
  p_company_id uuid, p_year int, p_month_from int default 1, p_month_to int default 12)
returns table(account_code text, account_name text, parent_code text, nature text,
  is_analytical boolean, sort_order integer, m1 numeric, m2 numeric, m3 numeric,
  m4 numeric, m5 numeric, m6 numeric, m7 numeric, m8 numeric, m9 numeric,
  m10 numeric, m11 numeric, m12 numeric, total numeric)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with mov as (
    select e.chart_of_account_id as coa_id,
           extract(month from coalesce(e.competency_date, e.issue_date))::int as mes,
           e.amount as valor
    from public.entries e
    join public.chart_of_accounts c on c.id = e.chart_of_account_id
    where e.company_id = p_company_id
      and e.invoice_account_id is null
      and e.status not in ('cancelled', 'refunded')
      and coalesce(e.competency_date, e.issue_date) is not null
      and extract(year  from coalesce(e.competency_date, e.issue_date))::int = p_year
      and extract(month from coalesce(e.competency_date, e.issue_date))::int between p_month_from and p_month_to
      and ((c.nature in ('revenue','deduction') and e.type = 'receivable')
        or (c.nature in ('variable_cost','fixed_cost','financial','depreciation','tax') and e.type = 'payable'))
    union all
    select t.chart_of_account_id,
           extract(month from to_date(t.date, 'DD/MM/YYYY'))::int,
           case when t.kind = 'credit' then -t.amount else t.amount end
    from public.transactions t
    join public.invoices i on i.id = t.invoice_id
    join public.accounts a on a.id = i.account_id
    where a.company_id = p_company_id
      and t.chart_of_account_id is not null
      and t.date ~ '^\d{2}/\d{2}/\d{4}$'
      and extract(year  from to_date(t.date, 'DD/MM/YYYY'))::int = p_year
      and extract(month from to_date(t.date, 'DD/MM/YYYY'))::int between p_month_from and p_month_to
  )
  select coa.code, coa.name, parent.code, coa.nature, coa.is_analytical, coa.sort_order,
    coalesce(sum(case when m.mes=1 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=2 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=3 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=4 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=5 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=6 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=7 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=8 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=9 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=10 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=11 then m.valor end),0::numeric),
    coalesce(sum(case when m.mes=12 then m.valor end),0::numeric),
    coalesce(sum(m.valor),0::numeric)
  from public.chart_of_accounts coa
  left join public.chart_of_accounts parent on parent.id = coa.parent_id
  left join mov m on m.coa_id = coa.id
  where coa.active = true
  group by coa.id, coa.code, coa.name, parent.code, coa.nature, coa.is_analytical, coa.sort_order
  order by coa.sort_order, coa.code;
end; $$;