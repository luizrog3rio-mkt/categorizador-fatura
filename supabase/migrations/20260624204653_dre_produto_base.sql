-- ============================================================================
-- DRE por produto — base: rateio_por_produto + de-para SKU Hotmart → produto
-- ============================================================================
-- APLICADA em 2026-06-24 — version 20260624204653. Auto-mapa pós-apply: Apruma 6,
-- Colheita 2, Cursos ~30, Palestras 6, Recorrência 2, Mentoria Individual 1, e 8
-- "A classificar" (Combo Black R$311k, Pagamentos, Mastermind, Recebimento…) p/ o
-- Luiz refinar na tela /produtos-hotmart.
--
-- Passo 1/2 da "DRE por produto" (modelo do contador): cada conta marca se rateia
-- por produto (Sim = receita/dedução/custo variável, acima da Margem); e mapeamos
-- os SKUs crus do Hotmart pros produtos da taxonomia (dre_products), com
-- auto-sugestão por palavra-chave — o Luiz refina os ambíguos na tela.
-- ============================================================================

-- 1) flag de rateio no plano de contas (default derivado da natureza)
alter table public.chart_of_accounts
  add column if not exists rateio_por_produto boolean not null default false;

update public.chart_of_accounts
set rateio_por_produto = (nature in ('revenue', 'deduction', 'variable_cost'));

-- 2) de-para SKU Hotmart → produto da DRE (1 linha por SKU distinto)
create table if not exists public.hotmart_product_map (
  product        text primary key,
  dre_product_id uuid references public.dre_products(id) on delete set null,
  updated_at     timestamptz not null default now()
);

alter table public.hotmart_product_map enable row level security;
create policy "authenticated all" on public.hotmart_product_map
  for all to authenticated using (true) with check (true);
revoke truncate, references, trigger, maintain on table public.hotmart_product_map from authenticated;
revoke all on table public.hotmart_product_map from anon;

-- 3) seed: todos os SKUs distintos, auto-mapeados por palavra-chave.
--    Ambíguos (combo/pagamento/recebimento/mastermind/visita/boné/rafia) ficam
--    NULL = "A classificar" pra forçar a revisão do Luiz; o resto não-identificado
--    cai em 'Cursos' (o balde mais provável).
insert into public.hotmart_product_map (product, dre_product_id)
select m.p,
       (select id from public.dre_products d where d.name = m.alvo order by d.company_id nulls first limit 1)
from (
  select distinct btrim(product) as p,
    case
      when btrim(product) ilike '%apruma%'                                    then 'Apruma'
      when btrim(product) ilike '%colheita%'                                  then 'Colheita'
      when btrim(product) ilike '%trampolim%'                                 then 'Trampolim'
      when btrim(product) ilike '%mentoria do rafa%'                          then 'Mentoria Individual'
      when btrim(product) ilike '%comunidade%' or btrim(product) ilike '%recorr%' then 'Recorrência'
      when btrim(product) ilike '%virada digital%' or btrim(product) ilike '%evento presencial%'
        or btrim(product) ilike '%ao vivo%' or btrim(product) ilike '%imers%' then 'Palestras'
      when btrim(product) ilike '%ebook%'                                     then 'Ebooks'
      when btrim(product) ilike '%combo%' or btrim(product) ilike '%pagamento%'
        or btrim(product) ilike '%recebimento%' or btrim(product) ilike '%mastermind%'
        or btrim(product) ilike '%visita%' or btrim(product) ilike '%boné%'
        or btrim(product) = 'Rafia'                                           then null
      else 'Cursos'
    end as alvo
  from public.hotmart_sales
  where product is not null and btrim(product) <> ''
) m
on conflict (product) do nothing;
