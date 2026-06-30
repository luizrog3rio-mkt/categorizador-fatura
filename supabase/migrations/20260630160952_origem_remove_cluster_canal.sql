-- APLICADA: 20260630160952
-- Auditoria 4 trilhas 2026-06-30 (divida tecnica): cluster CANAL morto. channel_id 100% nulo
-- em hotmart_sale_class e origin_tracking_rules, origin_channels 4 linhas orfas, zero uso no
-- frontend (CANAL saiu da UI em 2026-06-29). Remove: coluna channel_id (x2), tabela
-- origin_channels, RPC hotmart_by_channel, utils mortos hotmart_canal_base/hotmart_origin_suggest;
-- e recria a view hotmart_sales_origin + reapply_all + apply_origin_rules_one + as 3 RPCs keeper
-- SEM channel (origem agora vem so do grupo). Aprovado pelo Luiz em 2026-06-30.
-- Verificado: reapply_all/by_group/seller_report/unmapped funcionam; view sem canal/channel_id;
-- channel_id e origin_channels removidos; 3 funcoes mortas dropadas.
-- NOTA: o lockdown de EXECUTE (anon) das funcoes recriadas vem na migration seguinte.

create or replace function public.reapply_all()
returns integer language plpgsql security definer set search_path to '' as $function$
declare affected integer;
begin
  delete from public.hotmart_sale_class where source = 'rule';
  with matched as (
    select distinct on (hs.transaction_code) hs.transaction_code, r.id as rule_id, r.group_id, r.seller_id
    from public.hotmart_sales hs
    join public.origin_tracking_rules r on
      (case r.src_match when 'is_empty' then (hs.src is null or hs.src='') when 'contains' then r.src_value is not null and hs.src ilike '%'||r.src_value||'%' when 'starts_with' then r.src_value is not null and hs.src ilike r.src_value||'%' else r.src_value is null or hs.src=r.src_value end) and
      (case r.sck_match when 'is_empty' then (hs.sck is null or hs.sck='') when 'contains' then r.sck_value is not null and hs.sck ilike '%'||r.sck_value||'%' when 'starts_with' then r.sck_value is not null and hs.sck ilike r.sck_value||'%' else r.sck_value is null or hs.sck=r.sck_value end) and
      (case r.xcode_match when 'is_empty' then (hs.xcod is null or hs.xcod='') when 'contains' then r.xcode_value is not null and hs.xcod ilike '%'||r.xcode_value||'%' when 'starts_with' then r.xcode_value is not null and hs.xcod ilike r.xcode_value||'%' else r.xcode_value is null or hs.xcod=r.xcode_value end) and
      (case r.afiliado_match when 'is_empty' then (hs.affiliate is null or hs.affiliate='') when 'contains' then r.afiliado_value is not null and hs.affiliate ilike '%'||r.afiliado_value||'%' when 'starts_with' then r.afiliado_value is not null and hs.affiliate ilike r.afiliado_value||'%' else r.afiliado_value is null or hs.affiliate=r.afiliado_value end)
    order by hs.transaction_code,
      (case when r.src_value is not null or r.src_match='is_empty' then 1 else 0 end + case when r.sck_value is not null or r.sck_match='is_empty' then 1 else 0 end + case when r.xcode_value is not null or r.xcode_match='is_empty' then 1 else 0 end + case when r.afiliado_value is not null or r.afiliado_match='is_empty' then 1 else 0 end) desc,
      r.created_at asc
  )
  insert into public.hotmart_sale_class (transaction_code, group_id, seller_id, source, applied_by_rule, updated_at)
  select transaction_code, group_id, seller_id, 'rule', rule_id, now() from matched
  on conflict (transaction_code) do update set group_id=excluded.group_id, seller_id=excluded.seller_id, source='rule', applied_by_rule=excluded.applied_by_rule, updated_at=excluded.updated_at
    where public.hotmart_sale_class.source <> 'manual';
  select count(*) into affected from public.hotmart_sale_class where source='rule';
  return affected;
end; $function$;

create or replace function public.apply_origin_rules_one(p_tx text)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if exists (select 1 from public.hotmart_sale_class where transaction_code=p_tx and source='manual') then return; end if;
  with matched as (
    select distinct on (hs.transaction_code) hs.transaction_code, r.id as rule_id, r.group_id, r.seller_id
    from public.hotmart_sales hs
    join public.origin_tracking_rules r on
      (case r.src_match when 'is_empty' then (hs.src is null or hs.src='') when 'contains' then r.src_value is not null and hs.src ilike '%'||r.src_value||'%' when 'starts_with' then r.src_value is not null and hs.src ilike r.src_value||'%' else r.src_value is null or hs.src=r.src_value end) and
      (case r.sck_match when 'is_empty' then (hs.sck is null or hs.sck='') when 'contains' then r.sck_value is not null and hs.sck ilike '%'||r.sck_value||'%' when 'starts_with' then r.sck_value is not null and hs.sck ilike r.sck_value||'%' else r.sck_value is null or hs.sck=r.sck_value end) and
      (case r.xcode_match when 'is_empty' then (hs.xcod is null or hs.xcod='') when 'contains' then r.xcode_value is not null and hs.xcod ilike '%'||r.xcode_value||'%' when 'starts_with' then r.xcode_value is not null and hs.xcod ilike r.xcode_value||'%' else r.xcode_value is null or hs.xcod=r.xcode_value end) and
      (case r.afiliado_match when 'is_empty' then (hs.affiliate is null or hs.affiliate='') when 'contains' then r.afiliado_value is not null and hs.affiliate ilike '%'||r.afiliado_value||'%' when 'starts_with' then r.afiliado_value is not null and hs.affiliate ilike r.afiliado_value||'%' else r.afiliado_value is null or hs.affiliate=r.afiliado_value end)
    where hs.transaction_code = p_tx
    order by hs.transaction_code,
      (case when r.src_value is not null or r.src_match='is_empty' then 1 else 0 end + case when r.sck_value is not null or r.sck_match='is_empty' then 1 else 0 end + case when r.xcode_value is not null or r.xcode_match='is_empty' then 1 else 0 end + case when r.afiliado_value is not null or r.afiliado_match='is_empty' then 1 else 0 end) desc,
      r.created_at asc
  )
  insert into public.hotmart_sale_class (transaction_code, group_id, seller_id, source, applied_by_rule, updated_at)
  select transaction_code, group_id, seller_id, 'rule', rule_id, now() from matched
  on conflict (transaction_code) do update set group_id=excluded.group_id, seller_id=excluded.seller_id, source='rule', applied_by_rule=excluded.applied_by_rule, updated_at=excluded.updated_at
    where public.hotmart_sale_class.source <> 'manual';
end; $function$;

drop function if exists public.hotmart_by_channel(uuid, date, date, text);
drop function if exists public.hotmart_by_group(uuid, date, date, text);
drop function if exists public.hotmart_seller_report(uuid, date, date, text);
drop function if exists public.origin_unmapped_values(text, uuid, text);
drop view if exists public.hotmart_sales_origin;

create view public.hotmart_sales_origin with (security_invoker = true) as
select h.id, h.company_id, h.transaction_code, h.product, h.sale_date, h.release_date, h.gross_amount,
  h.hotmart_fee, h.affiliate_commission, h.coproduction_commission, h.net_amount, h.affiliate, h.coproducer,
  h.payment_method, h.status, h.buyer, h.imported_at, h.total_amount, h.currency, h.status_checked_at,
  h.fee_percentage, h.installments, h.commission_checked_at, h.sck, h.sck_checked_at, h.src, h.external_code,
  h.xcod, h.webhook_event_at,
  coalesce(gd.nome, 'a_classificar') as origem, sl.name as vendedor, cls.group_id, cls.seller_id
from public.hotmart_sales h
  left join public.hotmart_sale_class cls on cls.transaction_code = h.transaction_code
  left join public.origin_groups gd on gd.id = cls.group_id
  left join public.sellers sl on sl.id = cls.seller_id;
grant select on public.hotmart_sales_origin to authenticated;

create function public.hotmart_by_group(p_company uuid default null, p_start date default null, p_end date default null, p_currency text default 'BRL')
returns table(grupo text, vendas bigint, bruto numeric, total numeric, liquido numeric) language sql stable set search_path to '' as $function$
  select h.origem, count(*), coalesce(sum(h.gross_amount),0), coalesce(sum(h.total_amount),0), coalesce(sum(h.net_amount),0)
  from public.hotmart_sales_origin h
  where h.currency=p_currency and h.status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or h.company_id=p_company) and (p_start is null or h.sale_date>=p_start) and (p_end is null or h.sale_date<=p_end)
  group by h.origem order by 5 desc;
$function$;
grant execute on function public.hotmart_by_group(uuid, date, date, text) to authenticated;

create function public.hotmart_seller_report(p_company uuid default null, p_start date default null, p_end date default null, p_currency text default 'BRL')
returns table(vendedor text, vendas bigint, bruto numeric, total numeric, liquido numeric, comissao_afiliado numeric) language sql stable set search_path to '' as $function$
  select h.vendedor, count(*), coalesce(sum(h.gross_amount),0), coalesce(sum(h.total_amount),0), coalesce(sum(h.net_amount),0), coalesce(sum(h.affiliate_commission),0)
  from public.hotmart_sales_origin h
  where h.vendedor is not null and h.currency=p_currency and h.status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or h.company_id=p_company) and (p_start is null or h.sale_date>=p_start) and (p_end is null or h.sale_date<=p_end)
  group by h.vendedor order by 5 desc;
$function$;
grant execute on function public.hotmart_seller_report(uuid, date, date, text) to authenticated;

create function public.origin_unmapped_values(p_field text, p_company uuid default null, p_currency text default 'BRL')
returns table(valor text, qtd bigint) language sql stable security definer set search_path to '' as $function$
  select case p_field when 'src' then h.src when 'sck' then h.sck when 'afiliado' then h.affiliate end as valor, count(*) as qtd
  from public.hotmart_sales_origin h
  where h.origem='a_classificar' and h.currency=p_currency and h.status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or h.company_id=p_company)
    and case p_field when 'src' then h.src is not null and h.src<>'' when 'sck' then h.sck is not null and h.sck<>'' when 'afiliado' then h.affiliate is not null and h.affiliate<>'' end
  group by 1 order by qtd desc, valor;
$function$;
grant execute on function public.origin_unmapped_values(text, uuid, text) to authenticated;

drop function if exists public.hotmart_canal_base(text);
drop function if exists public.hotmart_origin_suggest(text);

alter table public.hotmart_sale_class drop column channel_id;
alter table public.origin_tracking_rules drop column channel_id;
drop table public.origin_channels;
