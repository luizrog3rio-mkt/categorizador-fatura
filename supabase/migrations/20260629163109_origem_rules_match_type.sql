-- APLICADA: 20260629163109
-- Adiciona tipo de match por campo (exact / contains / starts_with) em origin_tracking_rules.
-- Regras existentes ficam com 'exact' por padrão.
-- Aprovada pelo Luiz em 2026-06-29

alter table public.origin_tracking_rules
  add column src_match      text not null default 'exact' check (src_match      in ('exact','contains','starts_with')),
  add column sck_match      text not null default 'exact' check (sck_match      in ('exact','contains','starts_with')),
  add column xcode_match    text not null default 'exact' check (xcode_match    in ('exact','contains','starts_with')),
  add column afiliado_match text not null default 'exact' check (afiliado_match in ('exact','contains','starts_with'));

create or replace function public.apply_origin_rules()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  with matched as (
    select distinct on (hs.transaction_code)
      hs.transaction_code, r.group_id, r.channel_id, r.seller_id
    from public.hotmart_sales hs
    join public.origin_tracking_rules r on
      (r.src_value is null or case r.src_match
        when 'contains'    then hs.src ilike '%' || r.src_value || '%'
        when 'starts_with' then hs.src ilike r.src_value || '%'
        else hs.src = r.src_value end) and
      (r.sck_value is null or case r.sck_match
        when 'contains'    then hs.sck ilike '%' || r.sck_value || '%'
        when 'starts_with' then hs.sck ilike r.sck_value || '%'
        else hs.sck = r.sck_value end) and
      (r.xcode_value is null or case r.xcode_match
        when 'contains'    then hs.xcod ilike '%' || r.xcode_value || '%'
        when 'starts_with' then hs.xcod ilike r.xcode_value || '%'
        else hs.xcod = r.xcode_value end) and
      (r.afiliado_value is null or case r.afiliado_match
        when 'contains'    then hs.affiliate ilike '%' || r.afiliado_value || '%'
        when 'starts_with' then hs.affiliate ilike r.afiliado_value || '%'
        else hs.affiliate = r.afiliado_value end)
    left join public.hotmart_sale_class sc on sc.transaction_code = hs.transaction_code
    where sc.group_id is null
    order by hs.transaction_code,
      (case when r.src_value      is not null then 1 else 0 end +
       case when r.sck_value      is not null then 1 else 0 end +
       case when r.xcode_value    is not null then 1 else 0 end +
       case when r.afiliado_value is not null then 1 else 0 end) desc
  )
  insert into public.hotmart_sale_class (transaction_code, group_id, channel_id, seller_id, updated_at)
  select transaction_code, group_id, channel_id, seller_id, now() from matched
  on conflict (transaction_code) do update
    set group_id = excluded.group_id, channel_id = excluded.channel_id,
        seller_id = excluded.seller_id, updated_at = excluded.updated_at
    where public.hotmart_sale_class.group_id is null;
  get diagnostics affected = row_count;
  return affected;
end; $$;

create or replace function public.force_apply_origin_rule(p_rule_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer; r public.origin_tracking_rules;
begin
  select * into r from public.origin_tracking_rules where id = p_rule_id;
  if not found then return 0; end if;
  with matched as (
    select hs.transaction_code from public.hotmart_sales hs
    where (r.src_value is null or case r.src_match
        when 'contains'    then hs.src ilike '%' || r.src_value || '%'
        when 'starts_with' then hs.src ilike r.src_value || '%'
        else hs.src = r.src_value end)
      and (r.sck_value is null or case r.sck_match
        when 'contains'    then hs.sck ilike '%' || r.sck_value || '%'
        when 'starts_with' then hs.sck ilike r.sck_value || '%'
        else hs.sck = r.sck_value end)
      and (r.xcode_value is null or case r.xcode_match
        when 'contains'    then hs.xcod ilike '%' || r.xcode_value || '%'
        when 'starts_with' then hs.xcod ilike r.xcode_value || '%'
        else hs.xcod = r.xcode_value end)
      and (r.afiliado_value is null or case r.afiliado_match
        when 'contains'    then hs.affiliate ilike '%' || r.afiliado_value || '%'
        when 'starts_with' then hs.affiliate ilike r.afiliado_value || '%'
        else hs.affiliate = r.afiliado_value end)
  )
  insert into public.hotmart_sale_class (transaction_code, group_id, channel_id, seller_id, updated_at)
  select transaction_code, r.group_id, r.channel_id, r.seller_id, now() from matched
  on conflict (transaction_code) do update
    set group_id = excluded.group_id, channel_id = excluded.channel_id,
        seller_id = excluded.seller_id, updated_at = excluded.updated_at;
  get diagnostics affected = row_count;
  return affected;
end; $$;
