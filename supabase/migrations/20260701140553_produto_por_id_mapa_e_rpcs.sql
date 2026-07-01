-- ============================================================================
-- Reforma "produto por ID" — Fase 2: mapa + RPCs por product_id
-- ============================================================================
-- APLICADA em 2026-07-01 — version 20260701140553. Invariante verificada: dre_by_product
-- idêntica (0 diff) e dre_by_competency com valores idênticos (0 diff) via snapshot pré/pós.
-- Fase 2 da reforma (2026-07-01, pedido do Luiz). ATÔMICA por design: reestrutura
-- hotmart_product_map (chave nome→product_id) E reescreve as 3 RPCs que juntam
-- Hotmart por nome, na MESMA transação — senão haveria uma janela onde uma RPC
-- que junta por nome veria o mapa já "por id" (N linhas por nome) e faria fan-out,
-- multiplicando a receita.
--
-- INVARIANTE: como cada id HERDA o mesmo dre_product/conta do nome (nenhuma
-- reatribuição aqui), a DRE (competência e produto) tem que ficar IDÊNTICA.
-- Verificado por snapshot antes/depois (_snap_*_pre vs _post) fora desta migration.
-- Pré-condição garantida: 100% das vendas aprovadas têm product_id (Fase 1).
-- ============================================================================

-- ── Parte 1: reestruturar hotmart_product_map (nome → product_id) ────────────
-- FKs (dre_product_id, chart_of_account_id) e as 4 policies RLS são preservadas
-- (alteração in-place). Nada aponta PRA esta tabela, então trocar a PK é seguro.

alter table public.hotmart_product_map drop constraint hotmart_product_map_pkey;
alter table public.hotmart_product_map add column product_id bigint;

-- Expande: 1 linha por product_id distinto de hotmart_sales, herdando o mapeamento
-- do nome. array_agg filter pega o dre_product/conta mais recente de QUALQUER nome
-- que o id teve (robusto contra renomeação/trailing-space; join por btrim).
-- As linhas antigas (por nome) ainda têm product_id null neste ponto.
insert into public.hotmart_product_map (product_id, product, dre_product_id, chart_of_account_id, updated_at)
select s.product_id,
       max(btrim(s.product)),
       (array_agg(m.dre_product_id      order by m.updated_at desc nulls last) filter (where m.dre_product_id is not null))[1],
       (array_agg(m.chart_of_account_id order by m.updated_at desc nulls last) filter (where m.chart_of_account_id is not null))[1],
       now()
from public.hotmart_sales s
left join public.hotmart_product_map m on m.product = btrim(s.product) and m.product_id is null
where s.product_id is not null
group by s.product_id;

-- Remove as linhas antigas (por nome, sem id) e fixa a nova chave.
delete from public.hotmart_product_map where product_id is null;
alter table public.hotmart_product_map alter column product_id set not null;
alter table public.hotmart_product_map add primary key (product_id);

-- ── Parte 2: hotmart_produtos por product_id (alimenta a tela) ───────────────
-- Shape NOVO: passa a devolver product_id + product (nome). A tela (Fase 3) usa o id.
-- DROP antes do CREATE: o shape de retorno muda (5→6 colunas) e CREATE OR REPLACE NÃO
-- pode alterar o tipo de retorno (Postgres 42P13). Seguro: 1 só overload, zero callers
-- no banco, os grants são re-emitidos logo abaixo. (achado da verificação adversarial 2026-07-01)
drop function if exists public.hotmart_produtos(text);
create or replace function public.hotmart_produtos(p_currency text default 'BRL')
returns table (product_id bigint, product text, vendas bigint, bruto numeric, liquido numeric, dre_product_id uuid)
language sql stable security invoker set search_path = '' as $$
  select a.product_id,
         coalesce(m.product, a.nome) as product,
         a.vendas, a.bruto, a.liquido,
         m.dre_product_id
  from (
    select h.product_id,
           max(btrim(h.product)) as nome,
           count(*) as vendas,
           coalesce(sum(h.gross_amount), 0) as bruto,
           coalesce(sum(h.net_amount), 0) as liquido
    from public.hotmart_sales h
    where h.product_id is not null
      and h.currency = p_currency
      and h.status ~* 'aprovad|complet|conclu|approved'
    group by h.product_id
  ) a
  left join public.hotmart_product_map m on m.product_id = a.product_id;
$$;
revoke execute on function public.hotmart_produtos(text) from public, anon;
grant  execute on function public.hotmart_produtos(text) to authenticated;

-- ── Parte 3: dre_by_product por product_id ──────────────────────────────────
-- ÚNICA mudança vs versão anterior: o join Hotmart passa de (m.product = btrim(h.product))
-- para (m.product_id = h.product_id). O resto (entries) é idêntico.
create or replace function public.dre_by_product(p_company uuid default null, p_year integer default null, p_month_from integer default 1, p_month_to integer default 12, p_currency text default 'BRL')
returns table(dre_product_id uuid, bloco text, valor numeric)
language sql stable set search_path to '' as $$
  select hp.dre_product_id, v.bloco, v.valor
  from (
    select m.dre_product_id,
           coalesce(sum(h.gross_amount), 0) as rb,
           coalesce(sum(h.hotmart_fee), 0)  as ded,
           coalesce(sum(h.affiliate_commission + h.coproduction_commission), 0) as cv
    from public.hotmart_sales h
    left join public.hotmart_product_map m on m.product_id = h.product_id
    where h.currency = p_currency
      and h.status ~* 'aprovad|complet|conclu|approved'
      and (p_company is null or h.company_id = p_company)
      and (p_year is null or extract(year from h.sale_date)::int = p_year)
      and extract(month from h.sale_date)::int between p_month_from and p_month_to
    group by m.dre_product_id
  ) hp
  cross join lateral (values
    ('receita_bruta', hp.rb), ('deducao', hp.ded), ('custo_variavel', hp.cv)
  ) as v(bloco, valor)

  union all

  select coalesce(e.dre_product_id, coa.dre_product_id),
         case coa.nature when 'revenue' then 'receita_bruta'
                         when 'deduction' then 'deducao'
                         else 'custo_variavel' end,
         coalesce(sum(e.amount), 0)
  from public.entries e
  join public.chart_of_accounts coa on coa.id = e.chart_of_account_id
  where e.status not in ('cancelled', 'refunded')
    and e.invoice_account_id is null
    and coa.nature in ('revenue', 'deduction', 'variable_cost')
    and (p_company is null or e.company_id = p_company)
    and (p_year is null or extract(year from coalesce(e.competency_date, e.issue_date))::int = p_year)
    and extract(month from coalesce(e.competency_date, e.issue_date))::int between p_month_from and p_month_to
  group by coalesce(e.dre_product_id, coa.dre_product_id), coa.nature

  union all

  select null::uuid,
         case coa.nature when 'fixed_cost' then 'despesa_fixa'
                         when 'financial' then 'financeiro'
                         when 'depreciation' then 'depreciacao'
                         else 'imposto' end,
         coalesce(sum(e.amount), 0)
  from public.entries e
  join public.chart_of_accounts coa on coa.id = e.chart_of_account_id
  where e.status not in ('cancelled', 'refunded')
    and e.invoice_account_id is null
    and coa.nature in ('fixed_cost', 'financial', 'depreciation', 'tax')
    and (p_company is null or e.company_id = p_company)
    and (p_year is null or extract(year from coalesce(e.competency_date, e.issue_date))::int = p_year)
    and extract(month from coalesce(e.competency_date, e.issue_date))::int between p_month_from and p_month_to
  group by coa.nature;
$$;
revoke execute on function public.dre_by_product(uuid, integer, integer, integer, text) from public, anon;
grant  execute on function public.dre_by_product(uuid, integer, integer, integer, text) to authenticated;

-- ── Parte 4: dre_by_competency por product_id ───────────────────────────────
-- ÚNICA mudança vs versão anterior: os DOIS joins Hotmart (CTE mov 3ª união e CTE hot)
-- passam de (pm.product = h.product) para (pm.product_id = h.product_id). O resto
-- (entries, cartão, HOT-1/2/3, NC-1/2, seleção final) é idêntico.
-- NOTA (verificação adversarial 2026-07-01): a versão ANTIGA juntava por nome CRU (sem
-- btrim); 20 vendas com espaço à direita no nome (Mentoria Apruma / Aplicação Mentoria
-- Colheita, R$228.963,76) não casavam. O mapa novo é por id (via btrim), então elas
-- passam a casar — MAS têm chart nulo, ficando em HOT-1 nos DOIS casos: a DRE por
-- competência fica IDÊNTICA nos dados de hoje (comp_chart_diffs=0, provado venda a venda).
-- Se um dia esses produtos ganharem conta, a versão por id os classificará (correto) —
-- é a melhoria pretendida, não regressão.
create or replace function public.dre_by_competency(p_company_id uuid, p_year integer, p_month_from integer default 1, p_month_to integer default 12)
returns table(account_code text, account_name text, parent_code text, nature text, is_analytical boolean, sort_order integer, m1 numeric, m2 numeric, m3 numeric, m4 numeric, m5 numeric, m6 numeric, m7 numeric, m8 numeric, m9 numeric, m10 numeric, m11 numeric, m12 numeric, total numeric)
language plpgsql security definer set search_path to '' as $$
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
    join public.hotmart_product_map pm on pm.product_id = h.product_id
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
    left join public.hotmart_product_map pm on pm.product_id = h.product_id
    left join public.dre_products dp on dp.id = pm.dre_product_id
    where h.company_id = p_company_id and h.currency = 'BRL'
      and h.status ~* 'aprovad|complet|conclu|approved' and h.sale_date is not null
      and extract(year from h.sale_date)::int = p_year
      and extract(month from h.sale_date)::int between p_month_from and p_month_to
  ),
  naoclass as (
    select extract(month from coalesce(e.competency_date, e.issue_date, e.due_date))::int as mes,
           e.type::text as tp, e.amount as valor
    from public.entries e
    where e.company_id = p_company_id and e.invoice_account_id is null and e.transfer_id is null
      and e.chart_of_account_id is null
      and e.status not in ('cancelled','refunded')
      and coalesce(e.competency_date, e.issue_date, e.due_date) is not null
      and extract(year from coalesce(e.competency_date, e.issue_date, e.due_date))::int = p_year
      and extract(month from coalesce(e.competency_date, e.issue_date, e.due_date))::int between p_month_from and p_month_to
    union all
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
end; $$;
