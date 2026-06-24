-- ============================================================================
-- hotmart_produtos — resumo por SKU (vendas, bruto, líquido) + mapa atual
-- ============================================================================
-- APLICADA em 2026-06-24 — version 20260624205030.
--
-- Alimenta a tela de de-para (/produtos-hotmart): lista cada SKU cru aprovado/BRL
-- com nº de vendas, bruto, líquido e o produto da DRE já mapeado (LEFT JOIN no
-- hotmart_product_map → SKU novo aparece com dre_product_id NULL = a classificar).
-- Agrega no banco (PostgREST corta em 1000 linhas). Hardening = espelha
-- hotmart_totals (sql STABLE, SECURITY INVOKER, search_path='', GRANT authenticated).
-- ============================================================================

create or replace function public.hotmart_produtos(p_currency text default 'BRL')
returns table (product text, vendas bigint, bruto numeric, liquido numeric, dre_product_id uuid)
language sql stable security invoker set search_path = '' as $$
  select a.product, a.vendas, a.bruto, a.liquido, m.dre_product_id
  from (
    select btrim(h.product) as product,
           count(*) as vendas,
           coalesce(sum(h.gross_amount), 0) as bruto,
           coalesce(sum(h.net_amount), 0) as liquido
    from public.hotmart_sales h
    where h.product is not null and btrim(h.product) <> ''
      and h.currency = p_currency
      and h.status ~* 'aprovad|complet|conclu|approved'
    group by btrim(h.product)
  ) a
  left join public.hotmart_product_map m on m.product = a.product;
$$;

revoke execute on function public.hotmart_produtos(text) from public, anon;
grant  execute on function public.hotmart_produtos(text) to authenticated;
