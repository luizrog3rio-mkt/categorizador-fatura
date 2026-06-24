-- ============================================================================
-- hotmart_a_liberar — soma do liquido Hotmart ainda RETIDO (a liberar)
-- ============================================================================
-- APLICADA em 2026-06-24 — version 20260624171720. Sanity pos-apply: 0 vendas
-- BRL com release_date futura hoje (consolidado) -> RPC devolve 0, batendo com
-- o "A liberar R$ 0,00" do Dashboard (era dado real, nao subcount).
--
-- Por que: o "A liberar" do Dashboard (vendas aprovadas com release_date futura)
-- vinha somado no CLIENTE a partir de hotmart_sales, e o PostgREST corta a
-- resposta em 1000 linhas -> subcount com volume alto (mesma razao da
-- hotmart_totals). Esta RPC agrega no banco, exata a qualquer volume.
--
-- Hardening = espelha a hotmart_totals VIVA: language sql STABLE, SECURITY
-- INVOKER (herda a RLS de equipe using(true) sobre hotmart_sales), set
-- search_path='', referencia sempre public.<tabela>, GRANT EXECUTE so a
-- authenticated (default privileges revogados na Fase 1a). Filtra currency
-- (default 'BRL', nunca somar moedas) e a allowlist de receita (mesma regex da
-- hotmart_totals). release_date e coluna DATE (phase1c) -> compara com
-- current_date direto.
-- ============================================================================

create or replace function public.hotmart_a_liberar(
  p_company  uuid default null,
  p_currency text default 'BRL'
) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(sum(net_amount), 0)
  from public.hotmart_sales
  where status ~* 'aprovad|complet|conclu|approved'
    and currency = p_currency
    and release_date is not null
    and release_date >= current_date
    and (p_company is null or company_id = p_company);
$$;

revoke execute on function public.hotmart_a_liberar(uuid, text) from public, anon;
grant  execute on function public.hotmart_a_liberar(uuid, text) to authenticated;
