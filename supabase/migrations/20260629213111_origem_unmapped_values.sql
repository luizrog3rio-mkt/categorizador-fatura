-- APLICADA: 20260629213111
-- RPC read-only que alimenta a tela de mapeamento /classificar: devolve os VALORES
-- DISTINTOS de src|sck|afiliado entre as vendas A CLASSIFICAR, com contagem, por volume.
-- Universo canônico = aprovado + BRL (mesmo dos KPIs hotmart_totals), o que também
-- alinha os números entre a tela e os cards. Aprovada pelo Luiz em 2026-06-29.

create or replace function public.origin_unmapped_values(
  p_field text, p_company uuid default null, p_currency text default 'BRL')
returns table(valor text, qtd bigint)
language sql stable security definer set search_path = '' as $$
  select
    case p_field when 'src' then h.src when 'sck' then h.sck
                 when 'afiliado' then h.affiliate end as valor,
    count(*) as qtd
  from public.hotmart_sales_origin h
  where h.origem = 'a_classificar'
    and h.currency = p_currency
    and h.status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or h.company_id = p_company)
    and case p_field
      when 'src' then h.src is not null and h.src <> ''
      when 'sck' then h.sck is not null and h.sck <> ''
      when 'afiliado' then h.affiliate is not null and h.affiliate <> '' end
  group by 1
  order by qtd desc, valor;
$$;

grant execute on function public.origin_unmapped_values(text, uuid, text) to authenticated;
