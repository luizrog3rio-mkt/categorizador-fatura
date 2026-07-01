-- APLICADA: 20260701033821
-- Auditoria DRE (2026-06-30): a dre_by_competency ESCONDIA entries/cartao sem chart_of_account
-- (INNER JOIN os engolia) -> a RB7 DIGITAL mostrava a receita Hotmart mas omitia ~R$3,5M de
-- despesas nao-classificadas -> lucro ficticio (inflado). O Hotmart ja tinha o padrao "(a
-- classificar)" (HOT-1); entries/cartao nao. Fix (decisao do Luiz 2026-06-30, "as duas" -> esta e a
-- 1a parte; a ferramenta de classificacao em massa vem depois):
--  (a) data dos entries agora usa coalesce(competency, issue, DUE) -> os que so tinham due_date
--      (695) param de sumir; (b) linhas sinteticas "(A classificar)" pros entries+cartao sem conta
--      (NC-1 receitas, NC-2 despesas), espelhando o HOT-1. Sem mutacao de dado (o coalesce resolve
--      ao vivo). Anti-dupla-contagem: mov exige chart_of_account NOT NULL, naoclass exige NULL
--      (disjuntos). Nao afeta dre_by_product nem a conciliacao de caixa. security definer preservado.
create or replace function public.dre_by_competency(p_company_id uuid, p_year integer, p_month_from integer default 1, p_month_to integer default 12)
 returns table(account_code text, account_name text, parent_code text, nature text, is_analytical boolean, sort_order integer, m1 numeric, m2 numeric, m3 numeric, m4 numeric, m5 numeric, m6 numeric, m7 numeric, m8 numeric, m9 numeric, m10 numeric, m11 numeric, m12 numeric, total numeric)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  return query
  with mov as (
    select e.chart_of_account_id as coa_id,
           extract(month from coalesce(e.competency_date, e.issue_date, e.due_date))::int as mes, e.amount as valor
    from public.entries e
    join public.chart_of_accounts c on c.id = e.chart_of_account_id
    where e.company_id = p_company_id and e.invoice_account_id is null
      and e.status not in ('cancelled','refunded')
      and coalesce(e.competency_date, e.issue_date, e.due_date) is not null
      and extract(year from coalesce(e.competency_date, e.issue_date, e.due_date))::int = p_year
      and extract(month from coalesce(e.competency_date, e.issue_date, e.due_date))::int between p_month_from and p_month_to
      and ((c.nature in ('revenue','deduction') and e.type = 'receivable')
        or (c.nature in ('variable_cost','fixed_cost','financial','depreciation','tax') and e.type = 'payable'))
    union all
    select t.chart_of_account_id, extract(month from to_date(t.date,'DD/MM/YYYY'))::int,
           case when t.kind='credit' then -t.amount else t.amount end
    from public.transactions t
    join public.invoices i on i.id = t.invoice_id
    join public.accounts a on a.id = i.account_id
    join public.chart_of_accounts c2 on c2.id = t.chart_of_account_id
    where a.company_id = p_company_id and t.chart_of_account_id is not null
      and c2.nature in ('variable_cost','fixed_cost','financial','depreciation','tax')
      and t.date ~ '^\d{2}/\d{2}/\d{4}$'
      and extract(year from to_date(t.date,'DD/MM/YYYY'))::int = p_year
      and extract(month from to_date(t.date,'DD/MM/YYYY'))::int between p_month_from and p_month_to
    union all
    select coalesce(pm.chart_of_account_id, dp.chart_of_account_id), extract(month from h.sale_date)::int, h.gross_amount
    from public.hotmart_sales h
    join public.hotmart_product_map pm on pm.product = h.product
    left join public.dre_products dp on dp.id = pm.dre_product_id
    where coalesce(pm.chart_of_account_id, dp.chart_of_account_id) is not null
      and h.company_id = p_company_id and h.currency = 'BRL'
      and h.status ~* 'aprovad|complet|conclu|approved' and h.sale_date is not null
      and extract(year from h.sale_date)::int = p_year
      and extract(month from h.sale_date)::int between p_month_from and p_month_to
  ),
  hot as (
    select extract(month from h.sale_date)::int as mes,
           case when coalesce(pm.chart_of_account_id, dp.chart_of_account_id) is not null then 0::numeric else h.gross_amount end as gross,
           h.hotmart_fee as fee,
           coalesce(h.affiliate_commission,0) + coalesce(h.coproduction_commission,0) as com
    from public.hotmart_sales h
    left join public.hotmart_product_map pm on pm.product = h.product
    left join public.dre_products dp on dp.id = pm.dre_product_id
    where h.company_id = p_company_id and h.currency = 'BRL'
      and h.status ~* 'aprovad|complet|conclu|approved' and h.sale_date is not null
      and extract(year from h.sale_date)::int = p_year
      and extract(month from h.sale_date)::int between p_month_from and p_month_to
  ),
  naoclass as (
    -- entries sem chart_of_account (por tipo: payable=despesa, receivable=receita)
    select extract(month from coalesce(e.competency_date, e.issue_date, e.due_date))::int as mes,
           e.type::text as tp, e.amount as valor
    from public.entries e
    where e.company_id = p_company_id and e.invoice_account_id is null
      and e.chart_of_account_id is null
      and e.status not in ('cancelled','refunded')
      and coalesce(e.competency_date, e.issue_date, e.due_date) is not null
      and extract(year from coalesce(e.competency_date, e.issue_date, e.due_date))::int = p_year
      and extract(month from coalesce(e.competency_date, e.issue_date, e.due_date))::int between p_month_from and p_month_to
    union all
    -- cartao sem chart_of_account (sempre despesa; credito abate)
    select extract(month from to_date(t.date,'DD/MM/YYYY'))::int, 'payable'::text,
           case when t.kind='credit' then -t.amount else t.amount end
    from public.transactions t
    join public.invoices i on i.id = t.invoice_id
    join public.accounts a on a.id = i.account_id
    where a.company_id = p_company_id and t.chart_of_account_id is null
      and t.date ~ '^\d{2}/\d{2}/\d{4}$'
      and extract(year from to_date(t.date,'DD/MM/YYYY'))::int = p_year
      and extract(month from to_date(t.date,'DD/MM/YYYY'))::int between p_month_from and p_month_to
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
    ('HOT-1','Vendas Hotmart (a classificar)','revenue',-3, hot.gross),
    ('HOT-2','(−) Taxa Hotmart','deduction',-2, hot.fee),
    ('HOT-3','(−) Comissões Hotmart','variable_cost',-1, hot.com)
  ) as v(code, name, nat, so, val)
  group by v.code, v.name, v.nat, v.so
  union all
  select v.code, v.name, null::text, v.nat, true, v.so,
    coalesce(sum(v.val) filter (where nc.mes=1),0::numeric),  coalesce(sum(v.val) filter (where nc.mes=2),0::numeric),
    coalesce(sum(v.val) filter (where nc.mes=3),0::numeric),  coalesce(sum(v.val) filter (where nc.mes=4),0::numeric),
    coalesce(sum(v.val) filter (where nc.mes=5),0::numeric),  coalesce(sum(v.val) filter (where nc.mes=6),0::numeric),
    coalesce(sum(v.val) filter (where nc.mes=7),0::numeric),  coalesce(sum(v.val) filter (where nc.mes=8),0::numeric),
    coalesce(sum(v.val) filter (where nc.mes=9),0::numeric),  coalesce(sum(v.val) filter (where nc.mes=10),0::numeric),
    coalesce(sum(v.val) filter (where nc.mes=11),0::numeric), coalesce(sum(v.val) filter (where nc.mes=12),0::numeric),
    coalesce(sum(v.val),0::numeric)
  from naoclass nc
  cross join lateral (values
    ('NC-1','(Receitas a classificar)','revenue', 9998, case when nc.tp='receivable' then nc.valor else 0::numeric end),
    ('NC-2','(Despesas a classificar)','variable_cost', 9999, case when nc.tp='payable' then nc.valor else 0::numeric end)
  ) as v(code, name, nat, so, val)
  group by v.code, v.name, v.nat, v.so
  order by 6, 1;
end; $function$;
