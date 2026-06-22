-- ============================================================================
-- DRE — categories.dre_group + RPC dre_competencia (passo 3/4)
-- ============================================================================
-- APLICADA em 2026-06-22 via MCP apply_migration — version vivo 20260622171823
-- (renomeado do placeholder 20260622000004). A classificação inicial das 13
-- categorias em dre_group foi semeada à parte (UPDATE de dados, proposta do
-- Claude ratificada pelo Luiz; ajustável na tela Categorias). Pós-apply validado:
-- cascata fecha (Receita Bruta 6,1M -> ... -> Lucro Líquido, com R$1,7M ainda
-- em 'Não classificado').
--
-- DRE gerencial por margem de contribuição (estrutura do Excel do contato da RB7).
-- v1 (decisão do Luiz): consolidada (coluna TOTAL) + RECEITA por produto vinda do
-- Hotmart (SKU cru; de-para pra taxonomia do Excel = v2). Reusa o "motor" do passo 2.
--
--   1. categories.dre_group: o "Grupo na DRE" do Excel por categoria (NULL = a
--      classificar). CHECK com os 6 grupos. Coluna nullable, sem default, sem FK —
--      entra na policy RLS de equipe existente (using(true)), sem policy nova.
--   2. dre_competencia(p_company,p_start,p_end,p_currency): devolve (bloco, categoria,
--      valor magnitude). O frontend monta a cascata (Receita Bruta -> Deduções ->
--      Receita Líquida -> Custos Variáveis -> Margem -> Despesas Fixas -> EBITDA ->
--      Resultado Financeiro -> Impostos s/ Lucro -> Lucro Líquido) e os subtotais.
--      - Despesa: cartão (texto -> dre_group da categoria; sinal por kind) + entries
--        (FK; exclui cancelled e o lançamento de fatura/invoice_account_id; competência
--        por due_date). Categoria sem dre_group cai em 'Não classificado'.
--      - Receita Bruta: Hotmart gross por produto (allowlist + moeda da hotmart_totals).
--      - Dedução: taxas + comissões da Hotmart (reusa hotmart_totals).
--
-- Fixes herdados do passo 2: dedup de categorias por lower(btrim(name)) (anti fan-out),
-- regex no to_date do cartão, anti-dupla-contagem (invoice_account_id), cartão sempre
-- visível (sem company_id, igual Dashboard/Relatório). Hardening = espelha hotmart_totals.
-- ============================================================================

alter table public.categories add column if not exists dre_group text
  check (dre_group in ('Receita Bruta','Dedução','Custo Variável','Despesa Fixa','Resultado Financeiro','Imposto s/ Lucro'));

create or replace function public.dre_competencia(
  p_company uuid default null, p_start date default null, p_end date default null, p_currency text default 'BRL'
) returns table (bloco text, categoria text, valor numeric)
language sql stable security invoker set search_path = '' as $$
  with cats as (
    select distinct on (lower(btrim(name))) lower(btrim(name)) as chave, name, dre_group
    from public.categories order by lower(btrim(name)), created_at
  ),
  desp as (
    select coalesce(cc.dre_group,'Não classificado') as bloco,
           coalesce(cc.name, nullif(btrim(t.category),''),'Sem categoria') as categoria,
           case when t.kind='credit' then -t.amount else t.amount end as valor
    from public.transactions t left join cats cc on cc.chave = lower(btrim(t.category))
    where t.date ~ '^[0-3][0-9]/[0-1][0-9]/[0-9]{4}$'
      and (p_start is null or to_date(t.date,'DD/MM/YYYY') >= p_start)
      and (p_end   is null or to_date(t.date,'DD/MM/YYYY') <= p_end)
    union all
    select coalesce(c.dre_group,'Não classificado'),
           coalesce(c.name,'Sem categoria'), e.amount
    from public.entries e left join public.categories c on c.id = e.category_id
    where e.status <> 'cancelled' and e.invoice_account_id is null
      and (p_company is null or e.company_id = p_company)
      and (p_start is null or e.due_date >= p_start) and (p_end is null or e.due_date <= p_end)
  )
  select bloco, categoria, sum(valor) from desp group by bloco, categoria
  union all
  select 'Receita Bruta', 'Hotmart: ' || btrim(product), sum(gross_amount)
  from public.hotmart_sales
  where currency = p_currency and status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or company_id = p_company)
    and (p_start is null or sale_date >= p_start) and (p_end is null or sale_date <= p_end)
  group by btrim(product)
  union all
  select 'Dedução','Taxas Hotmart', taxas + afiliados
  from public.hotmart_totals(p_company,p_start,p_end,p_currency) where taxas + afiliados > 0;
$$;
grant execute on function public.dre_competencia(uuid,date,date,text) to authenticated, service_role;
