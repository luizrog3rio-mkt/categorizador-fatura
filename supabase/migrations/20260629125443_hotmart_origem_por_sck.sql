-- ============================================================================
-- Origem por SCK quando o SRC é vazio (caso `grp` e cia)
-- ----------------------------------------------------------------------------
-- A view hotmart_sales_origin classificava origem SÓ pelo canal-base do `src`.
-- Mas ~4,2k vendas (R$ 202,9k líquido) chegam com `src` VAZIO e a única pista de
-- origem está no `sck` (grp, l.instagram.com, direto, www.google.com, organico_*,
-- HOTMART_*...). Este patch faz o `sck` virar "canal" quando o `src` falta — só
-- pra vendas NÃO-vendedor — reaproveitando todo o de-para canal→origem da tela
-- /origem (hotmart_origin_map / hotmart_channels). Sem nova tabela, sem tocar
-- hotmart_sales: a origem segue 100% derivada ao vivo pela view.
--
-- Precedência: canal(src) > vendedor(sck) > canal(sck) > a_classificar.
--   - canal(src) primeiro: preserva o comportamento atual dos canais de src.
--   - vendedor ANTES de canal(sck): vendas de vendedor (ex.: luiz-otavio) viram
--     'comercial' e NÃO poluem a /origem como canal.
-- Reusa o MESMO hotmart_origin_map pros dois (src e sck); o canal_base agrupa o
-- sck (organico_* → organico, HOTMART_* → hotmart). Colisão de nome src×sck é
-- desprezível e, se ocorrer, mapeia pra mesma origem (aceitável por design).
--
-- Brinde: is_ruido em hotmart_channels passa a pegar visitor-id com PONTO
-- (^\d{10,}[._]\d+$), ex.: 1766358072382.3864644 (antes só pegava com underscore).
--
-- Só read-only (view) + 1 RPC; a função hotmart_canal_base e as tabelas NÃO mudam.
--
-- APLICADA: 2026-06-29 (version 20260629125443)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) View canônica — canal efetivo = src; fallback no sck quando src vazio E
--    não-vendedor. Precedência via ordem do coalesce.
-- ---------------------------------------------------------------------------
create or replace view public.hotmart_sales_origin with (security_invoker = true) as
  select h.*,
    coalesce(
      om.origem,                                                 -- canal efetivo mapeado
      case when sm.seller_id is not null then 'comercial' end,   -- vendedor
      'a_classificar'
    ) as origem
  from public.hotmart_sales h
  left join public.hotmart_sck_map sm
    on sm.sck = btrim(h.sck) and sm.seller_id is not null
  left join public.hotmart_origin_map om on om.canal = case
    when public.hotmart_canal_base(h.src) is not null then public.hotmart_canal_base(h.src)
    when sm.seller_id is null                          then public.hotmart_canal_base(h.sck)
    else null
  end;

-- ---------------------------------------------------------------------------
-- 2) RPC de-para: lista os canais a mapear, agora incluindo os derivados de sck
--    (mesmo canal efetivo da view → soma garantida).
-- ---------------------------------------------------------------------------
create or replace function public.hotmart_channels(p_currency text default 'BRL')
returns table (canal text, vendas bigint, bruto numeric, liquido numeric,
               origem text, sugestao text, is_ruido boolean)
language sql stable security invoker set search_path = '' as $$
  select a.canal, a.vendas, a.bruto, a.liquido,
         m.origem,
         public.hotmart_origin_suggest(a.canal),
         (a.canal ~ '\{\{' or a.canal ~ '^\d+$' or a.canal ~ '^\d{10,}[._]\d+$')
  from (
    select case
             when public.hotmart_canal_base(h.src) is not null then public.hotmart_canal_base(h.src)
             when sm.seller_id is null                          then public.hotmart_canal_base(h.sck)
             else null
           end as canal,
           count(*) as vendas,
           coalesce(sum(h.gross_amount), 0) as bruto,
           coalesce(sum(h.net_amount), 0)  as liquido
    from public.hotmart_sales h
    left join public.hotmart_sck_map sm
      on sm.sck = btrim(h.sck) and sm.seller_id is not null
    where h.currency = p_currency
      and h.status ~* 'aprovad|complet|conclu|approved'
      and case
             when public.hotmart_canal_base(h.src) is not null then public.hotmart_canal_base(h.src)
             when sm.seller_id is null                          then public.hotmart_canal_base(h.sck)
             else null
          end is not null
    group by 1
  ) a
  left join public.hotmart_origin_map m on m.canal = a.canal
  order by (m.origem is not null), 7, 2 desc, 1;
$$;
