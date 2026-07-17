-- Auditoria contábil de abril a junho/2026
-- =============================================================================
-- SOMENTE LEITURA: este arquivo contém apenas SELECTs e não altera produção.
-- Execute cada bloco separadamente pelo MCP Supabase depois de autenticar com /mcp.
-- Objetivos: fechar o gabarito do contador, localizar classificações pendentes e
-- levantar os product_id candidatos à apropriação mensal de mentorias.
-- =============================================================================

-- 1) DRE viva por empresa no período (linhas com movimento).
select
  c.id as company_id,
  c.name as empresa,
  d.account_code as codigo,
  d.account_name as conta,
  d.nature as natureza,
  d.m4 as abril,
  d.m5 as maio,
  d.m6 as junho,
  d.total
from public.companies c
cross join lateral public.dre_by_competency(c.id, 2026, 4, 6) d
where d.m4 <> 0 or d.m5 <> 0 or d.m6 <> 0
order by c.name, d.sort_order, d.account_code;

-- 2) Alertas que hoje podem distorcer ou esconder a DRE.
with entries_nc as (
  select e.company_id, count(*) as qtd, coalesce(sum(e.amount), 0) as valor
  from public.entries e
  where e.invoice_account_id is null
    and e.transfer_id is null
    and e.chart_of_account_id is null
    and e.status not in ('cancelled', 'refunded')
    and coalesce(e.competency_date, e.issue_date, e.due_date) >= date '2026-04-01'
    and coalesce(e.competency_date, e.issue_date, e.due_date) <  date '2026-07-01'
  group by e.company_id
), tx_nc as (
  select a.company_id, count(*) as qtd,
         coalesce(sum(case when t.kind = 'credit' then -t.amount else t.amount end), 0) as valor
  from public.transactions t
  join public.invoices i on i.id = t.invoice_id
  join public.accounts a on a.id = i.account_id
  where t.chart_of_account_id is null
    and t.date ~ '^\d{2}/\d{2}/\d{4}$'
    and to_date(t.date, 'DD/MM/YYYY') >= date '2026-04-01'
    and to_date(t.date, 'DD/MM/YYYY') <  date '2026-07-01'
  group by a.company_id
)
select
  c.id as company_id,
  c.name as empresa,
  coalesce(en.qtd, 0) as entries_a_classificar,
  coalesce(en.valor, 0) as valor_entries_a_classificar,
  coalesce(tn.qtd, 0) as cartao_a_classificar,
  coalesce(tn.valor, 0) as valor_cartao_a_classificar,
  inv.qtd_entries as entries_invisiveis_total,
  inv.valor_entries as valor_entries_invisiveis_total,
  inv.qtd_tx as cartao_invisivel_total,
  inv.valor_tx as valor_cartao_invisivel_total,
  inv.contas as principais_contas_invisiveis
from public.companies c
left join entries_nc en on en.company_id = c.id
left join tx_nc tn on tn.company_id = c.id
cross join lateral public.dre_lancamentos_invisiveis(c.id) inv
order by c.name;

-- 3) Impostos citados na reunião: competência, tipo e conta atualmente usados.
select
  c.name as empresa,
  e.id,
  coalesce(e.competency_date, e.issue_date, e.due_date) as competencia_efetiva,
  e.issue_date as emissao,
  e.due_date as vencimento,
  e.payment_date as pagamento,
  e.description as descricao,
  e.counterparty as contraparte,
  e.type as tipo_lancamento,
  e.status,
  e.amount as valor,
  coa.code as conta_codigo,
  coa.name as conta,
  coa.nature as natureza,
  coa.tipo as tipo_contabil
from public.entries e
join public.companies c on c.id = e.company_id
left join public.chart_of_accounts coa on coa.id = e.chart_of_account_id
where concat_ws(' ', e.description, e.counterparty, e.notes) ~* '\m(PIS|COFINS|ICMS|ISS)\M'
  and coalesce(e.competency_date, e.issue_date, e.due_date) >= date '2026-04-01'
  and coalesce(e.competency_date, e.issue_date, e.due_date) <  date '2026-07-01'
order by c.name, competencia_efetiva, e.description;

-- 4) Produtos Hotmart do período e seu mapeamento. Linhas sem conta de receita
-- alimentam HOT-1; este resultado também fornece os product_id para o contador.
select
  h.product_id,
  max(h.product) as produto_hotmart,
  count(*) as vendas,
  sum(h.gross_amount) as bruto,
  pm.dre_product_id,
  dp.name as produto_dre,
  coalesce(pm.chart_of_account_id, dp.chart_of_account_id) as conta_receita_id,
  coa.code as conta_receita_codigo,
  coa.name as conta_receita,
  case
    when pm.product_id is null then 'SEM MAPA'
    when coalesce(pm.chart_of_account_id, dp.chart_of_account_id) is null then 'SEM CONTA DE RECEITA'
    else 'OK'
  end as situacao
from public.hotmart_sales h
left join public.hotmart_product_map pm on pm.product_id = h.product_id
left join public.dre_products dp on dp.id = pm.dre_product_id
left join public.chart_of_accounts coa
  on coa.id = coalesce(pm.chart_of_account_id, dp.chart_of_account_id)
where h.company_id is not null
  and h.currency = 'BRL'
  and h.status ~* 'aprovad|complet|conclu|approved'
  and h.sale_date >= date '2026-04-01'
  and h.sale_date <  date '2026-07-01'
group by h.product_id, pm.product_id, pm.dre_product_id, dp.name,
         pm.chart_of_account_id, dp.chart_of_account_id, coa.code, coa.name
order by bruto desc, h.product_id;

-- 5) Candidatos à apropriação de mentorias. A seleção é deliberadamente ampla:
-- o contador precisa marcar quais IDs entram e a duração de cada um.
select
  h.product_id,
  max(h.product) as produto_hotmart,
  dp.name as produto_dre,
  min(h.sale_date) as primeira_venda,
  max(h.sale_date) as ultima_venda,
  count(*) as vendas,
  sum(h.gross_amount) as bruto
from public.hotmart_sales h
left join public.hotmart_product_map pm on pm.product_id = h.product_id
left join public.dre_products dp on dp.id = pm.dre_product_id
where h.currency = 'BRL'
  and h.status ~* 'aprovad|complet|conclu|approved'
  and (
    h.product ~* 'mentor|apruma|colheita|trampolim|mastermind'
    or dp.name ~* 'mentor|apruma|colheita|trampolim|mastermind'
  )
group by h.product_id, dp.name
order by bruto desc, h.product_id;

-- 6) Consórcios: localizar cada lançamento e separar o que já está patrimonial
-- do que ainda está em conta de resultado ou sem conta.
select
  c.name as empresa,
  e.id,
  coalesce(e.competency_date, e.issue_date, e.due_date) as competencia_efetiva,
  e.description as descricao,
  e.counterparty as contraparte,
  e.status,
  e.amount as valor,
  coa.code as conta_codigo,
  coa.name as conta,
  coa.tipo as tipo_contabil,
  coa.nature as natureza
from public.entries e
join public.companies c on c.id = e.company_id
left join public.chart_of_accounts coa on coa.id = e.chart_of_account_id
where concat_ws(' ', e.description, e.counterparty, e.notes) ~* 'cons[oó]rc'
order by c.name, competencia_efetiva, e.description;

-- 7) Competências que coincidem com vencimento e merecem validação humana.
-- Não são necessariamente erro: o bloco é uma fila de revisão, não um diagnóstico.
select
  c.name as empresa,
  count(*) as lancamentos,
  sum(e.amount) as valor,
  min(e.competency_date) as primeira_competencia,
  max(e.competency_date) as ultima_competencia
from public.entries e
join public.companies c on c.id = e.company_id
where e.competency_date = e.due_date
  and e.competency_date >= date '2026-04-01'
  and e.competency_date <  date '2026-07-01'
group by c.name
order by c.name;

-- 8) Saldos de abertura disponíveis hoje para o futuro Balanço.
select
  c.name as empresa,
  a.id as account_id,
  a.name as conta_financeira,
  a.type,
  a.initial_balance as saldo_inicial,
  coa.code as conta_patrimonial_codigo,
  coa.name as conta_patrimonial
from public.accounts a
join public.companies c on c.id = a.company_id
left join public.chart_of_accounts coa on coa.id = a.conta_contabil_id
where a.active = true
order by c.name, a.name;
