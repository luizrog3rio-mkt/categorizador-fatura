-- APLICADA: 20260630110613
-- Auditoria financeira (achado critico): a dre_by_competency (DRE principal, tela DRE) nao lia
-- hotmart_sales. Como a receita do grupo e 100% Hotmart (entries nature=revenue = R$0 em todas
-- as empresas), a Receita Bruta saia R$0 pra toda empresa/ano, COM as despesas aparecendo =
-- prejuizo FABRICADO de milhoes (RB7 DIGITAL: R$0 vs R$3,62M reais em 2026).
-- Fix: 3 linhas sinteticas de Hotmart por mes — bruto->receita_bruta, taxa->deducao,
-- comissoes (afiliado+copro)->custo_variavel — filtradas por empresa + currency=BRL + status
-- aprovado/completo (mesma allowlist do resto). SEM dupla contagem: confirmado que Hotmart NAO
-- esta em entries. Verificado pos-fix: Receita Bruta RB7 DIGITAL 2026 = R$3.622.779 (bate exato
-- com o gross Hotmart). Aprovado pelo Luiz em 2026-06-30.
-- MUDANCA DE REGRA: Hotmart agora entra nas DUAS DREs (antes "so na DRE por produto"). As duas
-- passam a reconciliar (competencia ainda inclui cartao, que a produto nao tem).
create or replace function public.dre_by_competency(p_company_id uuid, p_year integer, p_month_from integer default 1, p_month_to integer default 12)
returns table(account_code text, account_name text, parent_code text, nature text, is_analytical boolean, sort_order integer,
  m1 numeric, m2 numeric, m3 numeric, m4 numeric, m5 numeric, m6 numeric, m7 numeric, m8 numeric, m9 numeric, m10 numeric, m11 numeric, m12 numeric, total numeric)
language plpgsql security definer set search_path to '' as $function$
begin
  return query
  with mov as (
    select e.chart_of_account_id as coa_id,
           extract(month from coalesce(e.competency_date, e.issue_date))::int as mes, e.amount as valor
    from public.entries e
    join public.chart_of_accounts c on c.id = e.chart_of_account_id
    where e.company_id = p_company_id and e.invoice_account_id is null
      and e.status not in ('cancelled','refunded')
      and coalesce(e.competency_date, e.issue_date) is not null
      and extract(year from coalesce(e.competency_date, e.issue_date))::int = p_year
      and extract(month from coalesce(e.competency_date, e.issue_date))::int between p_month_from and p_month_to
      and ((c.nature in ('revenue','deduction') and e.type = 'receivable')
        or (c.nature in ('variable_cost','fixed_cost','financial','depreciation','tax') and e.type = 'payable'))
    union all
    select t.chart_of_account_id, extract(month from to_date(t.date,'DD/MM/YYYY'))::int,
           case when t.kind='credit' then -t.amount else t.amount end
    from public.transactions t
    join public.invoices i on i.id = t.invoice_id
    join public.accounts a on a.id = i.account_id
    where a.company_id = p_company_id and t.chart_of_account_id is not null
      and t.date ~ '^\d{2}/\d{2}/\d{4}$'
      and extract(year from to_date(t.date,'DD/MM/YYYY'))::int = p_year
      and extract(month from to_date(t.date,'DD/MM/YYYY'))::int between p_month_from and p_month_to
  ),
  hot as (
    select extract(month from h.sale_date)::int as mes,
           h.gross_amount as gross, h.hotmart_fee as fee,
           coalesce(h.affiliate_commission,0) + coalesce(h.coproduction_commission,0) as com
    from public.hotmart_sales h
    where h.company_id = p_company_id and h.currency = 'BRL'
      and h.status ~* 'aprovad|complet|conclu|approved' and h.sale_date is not null
      and extract(year from h.sale_date)::int = p_year
      and extract(month from h.sale_date)::int between p_month_from and p_month_to
  )
  select coa.code, coa.name, parent.code, coa.nature, coa.is_analytical, coa.sort_order,
    coalesce(sum(m.valor) filter (where m.mes=1),0::numeric),  coalesce(sum(m.valor) filter (where m.mes=2),0::numeric),
    coalesce(sum(m.valor) filter (where m.mes=3),0::numeric),  coalesce(sum(m.valor) filter (where m.mes=4),0::numeric),
    coalesce(sum(m.valor) filter (where m.mes=5),0::numeric),  coalesce(sum(m.valor) filter (where m.mes=6),0::numeric),
    coalesce(sum(m.valor) filter (where m.mes=7),0::numeric),  coalesce(sum(m.valor) filter (where m.mes=8),0::numeric),
    coalesce(sum(m.valor) filter (where m.mes=9),0::numeric),  coalesce(sum(m.valor) filter (where m.mes=10),0::numeric),
    coalesce(sum(m.valor) filter (where m.mes=11),0::numeric), coalesce(sum(m.valor) filter (where m.mes=12),0::numeric),
    coalesce(sum(m.valor),0::numeric)
  from public.chart_of_accounts coa
  left join public.chart_of_accounts parent on parent.id = coa.parent_id
  left join mov m on m.coa_id = coa.id
  where coa.active = true
  group by coa.id, coa.code, coa.name, parent.code, coa.nature, coa.is_analytical, coa.sort_order

  union all

  select v.code, v.name, null::text, v.nat, true, v.so,
    coalesce(sum(v.val) filter (where hot.mes=1),0::numeric),  coalesce(sum(v.val) filter (where hot.mes=2),0::numeric),
    coalesce(sum(v.val) filter (where hot.mes=3),0::numeric),  coalesce(sum(v.val) filter (where hot.mes=4),0::numeric),
    coalesce(sum(v.val) filter (where hot.mes=5),0::numeric),  coalesce(sum(v.val) filter (where hot.mes=6),0::numeric),
    coalesce(sum(v.val) filter (where hot.mes=7),0::numeric),  coalesce(sum(v.val) filter (where hot.mes=8),0::numeric),
    coalesce(sum(v.val) filter (where hot.mes=9),0::numeric),  coalesce(sum(v.val) filter (where hot.mes=10),0::numeric),
    coalesce(sum(v.val) filter (where hot.mes=11),0::numeric), coalesce(sum(v.val) filter (where hot.mes=12),0::numeric),
    coalesce(sum(v.val),0::numeric)
  from hot
  cross join lateral (values
    ('HOT-1','Vendas Hotmart','revenue',-3, hot.gross),
    ('HOT-2','(−) Taxa Hotmart','deduction',-2, hot.fee),
    ('HOT-3','(−) Comissões Hotmart','variable_cost',-1, hot.com)
  ) as v(code, name, nat, so, val)
  group by v.code, v.name, v.nat, v.so

  order by 6, 1;
end; $function$;
