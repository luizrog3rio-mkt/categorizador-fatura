-- ============================================================================
-- RPC hotmart_by_affiliate — "Total por afiliado"
-- ----------------------------------------------------------------------------
-- Agrega vendas com afiliado (preenchido pelo modo refresh_commissions, via
-- /sales/commissions) agrupando por nome. Soma a comissão do afiliado, o bruto,
-- o total pago e o líquido que o produtor (RB7) recebeu nessas vendas. Filtra
-- moeda (default BRL — nunca somar BRL+USD) e a allowlist de status de receita.
-- Soma/agregação vai pro banco (PostgREST limita resposta a 1000 linhas). Mesmo
-- padrão da hotmart_totals: language sql stable, set search_path='', grant a
-- authenticated (default privileges revogados na Fase 1a).
--
-- APLICADA: 2026-06-25 (version 20260625211536)
-- ============================================================================

create function public.hotmart_by_affiliate(
  p_company uuid default null, p_start date default null,
  p_end date default null, p_currency text default 'BRL'
)
returns table(afiliado text, qtd bigint, comissao numeric, bruto numeric,
              total numeric, liquido_produtor numeric)
language sql stable set search_path to '' as $$
  select
    affiliate,
    count(*),
    coalesce(sum(affiliate_commission), 0),
    coalesce(sum(gross_amount), 0),
    coalesce(sum(total_amount), 0),
    coalesce(sum(net_amount), 0)
  from public.hotmart_sales
  where affiliate is not null
    and affiliate_commission > 0
    and currency = p_currency
    and status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or company_id = p_company)
    and (p_start is null or sale_date >= p_start)
    and (p_end   is null or sale_date <= p_end)
  group by affiliate
  order by sum(affiliate_commission) desc;
$$;

grant execute on function public.hotmart_by_affiliate(uuid, date, date, text) to authenticated;
