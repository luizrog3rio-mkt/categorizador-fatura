-- hotmart_totals v2: além de bruto/taxas/afiliados/líquido, agora soma
-- total_amount (valor pago, com juros) e FILTRA por moeda (p_currency default
-- 'BRL') — não somar BRL+USD no mesmo total. Devolve fora_moeda = nº de vendas
-- de outra moeda excluídas (a UI avisa). Recriada (return type mudou → drop+create).
-- Mantém set search_path='' e grant execute to authenticated (default privileges
-- foram revogados na Fase 1a).
--
-- APLICADA: 2026-06-11 (version 20260611164017)

drop function if exists public.hotmart_totals(uuid, date, date);

create function public.hotmart_totals(
  p_company uuid default null, p_start date default null,
  p_end date default null, p_currency text default 'BRL'
)
returns table(qtd bigint, total numeric, bruto numeric, taxas numeric,
              afiliados numeric, liquido numeric, fora_moeda bigint)
language sql stable set search_path to '' as $$
  select
    count(*) filter (where currency = p_currency),
    coalesce(sum(total_amount)  filter (where currency = p_currency), 0),
    coalesce(sum(gross_amount)  filter (where currency = p_currency), 0),
    coalesce(sum(hotmart_fee)   filter (where currency = p_currency), 0),
    coalesce(sum(affiliate_commission + coproduction_commission) filter (where currency = p_currency), 0),
    coalesce(sum(net_amount)    filter (where currency = p_currency), 0),
    count(*) filter (where currency <> p_currency)
  from public.hotmart_sales
  where status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or company_id = p_company)
    and (p_start is null or sale_date >= p_start)
    and (p_end   is null or sale_date <= p_end);
$$;

grant execute on function public.hotmart_totals(uuid, date, date, text) to authenticated;
