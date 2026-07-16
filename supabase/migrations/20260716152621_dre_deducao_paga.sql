-- dre_deducao_paga — BUGFIX: dedução PAGA sumia da DRE
-- ============================================================================================
-- STATUS: ✅ APLICADA em 2026-07-16 (version 20260716152621), aprovada pelo Luiz ("corrige o bug").
--   Verificado pós-apply: deduções em contas 274.936,36 → 440.934,32 (+165.997,96 — bate ao centavo
--   com o dry-run); receitas e custos INALTERADOS (o fix atingiu só deduções). As contas que
--   evaporavam agora aparecem: 2.1.03 PIS/COFINS R$147.731,52, 2.1.01 ISS R$16.936,53, 2.3.01, 2.4.x.
--   Efeito pretendido: Receita Líquida e Lucro da Digital caem R$166k — e ficam CORRETOS.
-- ============================================================================================
--
-- O BUG (achado em 2026-07-16, ao investigar uma queda na DRE): o CTE `mov` exigia
--     (c.nature in ('revenue','deduction') and e.type = 'receivable')
--   ou seja, uma conta de DEDUÇÃO só entrava na DRE se o lançamento fosse `receivable`.
--   Mas imposto sobre venda SE PAGA → `type = 'payable'`. Resultado: a dedução não entrava em
--   `mov` (nature/type incompatíveis) NEM em `naoclass` (que exige chart_of_account_id null):
--   **evaporava da DRE, silenciosamente**. Efeito: Receita Líquida e Lucro INFLADOS.
--
--   Invisíveis hoje: RB7 DIGITAL/2026 = 23 lançamentos, R$165.997,96 (PIS/COFINS R$147.731,52,
--   ISS R$23.150,66, Taxa de Cartão, Reembolsos, TMB); + Rafael Brito R$50.000; + 2025 R$6.214,13.
--
-- O FIX: dedução entra independente do type — paga (imposto, o caso real) ou estornada.
--   `(c.nature = 'deduction')` no lugar de `(c.nature in ('revenue','deduction') and receivable)`.
--   Receita segue exigindo `receivable` (um `payable` numa conta de receita é erro de classificação,
--   NÃO deve virar receita — ver nota abaixo). Custos seguem exigindo `payable`.
--
--   O sinal não muda: dedução soma `amount` positivo e o FRONT a subtrai na cascata (Receita Bruta
--   − Deduções = Receita Líquida). É o mesmo tratamento que a dedução `receivable` já tinha.
--
-- ⚠️ A DRE **VAI MUDAR** — de propósito, é o bug sendo corrigido. As deduções passam a abater a
--   receita: Receita Líquida e Lucro CAEM (ficam corretos). Isto é a única exceção consciente à
--   invariante "nenhum número muda": aqui o número atual está ERRADO.
--
-- FORA DO ESCOPO (achado registrado, sem ação): 15 lançamentos `payable` em contas de RECEITA
--   (1.1.02 Apruma R$71k, 1.8 Outras Receitas, 1.1.03, 1.1.04) continuam invisíveis — são erro de
--   classificação e incluí-los como receita seria pior. Merecem uma linha de alerta própria (a
--   fazer) para nada sumir em silêncio.
--
-- ESCOPO: só o braço de `entries` do `mov`. O braço do CARTÃO mantém a guarda de natureza de custo
--   (migration dre_competencia_guarda_natureza_cartao) — intencional, anti receita-fantasma.
-- ROLLBACK: restaurar o predicado anterior `(c.nature in ('revenue','deduction') and e.type='receivable')`.

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
      -- BUGFIX: dedução entra PAGA (imposto sobre venda) ou estornada; receita só receivable; custo só payable.
      and ((c.nature = 'revenue' and e.type = 'receivable')
        or (c.nature = 'deduction')
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
  where coa.active = true and coa.tipo = 'resultado'
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
