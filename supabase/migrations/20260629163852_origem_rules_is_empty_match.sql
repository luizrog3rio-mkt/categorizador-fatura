-- APLICADA: 20260629163852
-- Adiciona 'is_empty' como tipo de match nas regras de origem (casa com NULL ou string vazia).
-- Aprovada pelo Luiz em 2026-06-29

alter table public.origin_tracking_rules
  drop constraint origin_tracking_rules_src_match_check,
  drop constraint origin_tracking_rules_sck_match_check,
  drop constraint origin_tracking_rules_xcode_match_check,
  drop constraint origin_tracking_rules_afiliado_match_check,
  add constraint origin_tracking_rules_src_match_check      check (src_match      in ('exact','contains','starts_with','is_empty')),
  add constraint origin_tracking_rules_sck_match_check      check (sck_match      in ('exact','contains','starts_with','is_empty')),
  add constraint origin_tracking_rules_xcode_match_check    check (xcode_match    in ('exact','contains','starts_with','is_empty')),
  add constraint origin_tracking_rules_afiliado_match_check check (afiliado_match in ('exact','contains','starts_with','is_empty'));

alter table public.origin_tracking_rules
  drop constraint origin_tracking_rules_has_condition,
  add constraint origin_tracking_rules_has_condition check (
    (src_value is not null or src_match = 'is_empty') or
    (sck_value is not null or sck_match = 'is_empty') or
    (xcode_value is not null or xcode_match = 'is_empty') or
    (afiliado_value is not null or afiliado_match = 'is_empty')
  );

create or replace function public.apply_origin_rules()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  with matched as (
    select distinct on (hs.transaction_code)
      hs.transaction_code, r.group_id, r.channel_id, r.seller_id
    from public.hotmart_sales hs
    join public.origin_tracking_rules r on
      (case r.src_match
        when 'is_empty'    then (hs.src is null or hs.src = '')
        when 'contains'    then r.src_value is not null and hs.src ilike '%' || r.src_value || '%'
        when 'starts_with' then r.src_value is not null and hs.src ilike r.src_value || '%'
        else r.src_value is null or hs.src = r.src_value end) and
      (case r.sck_match
        when 'is_empty'    then (hs.sck is null or hs.sck = '')
        when 'contains'    then r.sck_value is not null and hs.sck ilike '%' || r.sck_value || '%'
        when 'starts_with' then r.sck_value is not null and hs.sck ilike r.sck_value || '%'
        else r.sck_value is null or hs.sck = r.sck_value end) and
      (case r.xcode_match
        when 'is_empty'    then (hs.xcod is null or hs.xcod = '')
        when 'contains'    then r.xcode_value is not null and hs.xcod ilike '%' || r.xcode_value || '%'
        when 'starts_with' then r.xcode_value is not null and hs.xcod ilike r.xcode_value || '%'
        else r.xcode_value is null or hs.xcod = r.xcode_value end) and
      (case r.afiliado_match
        when 'is_empty'    then (hs.affiliate is null or hs.affiliate = '')
        when 'contains'    then r.afiliado_value is not null and hs.affiliate ilike '%' || r.afiliado_value || '%'
        when 'starts_with' then r.afiliado_value is not null and hs.affiliate ilike r.afiliado_value || '%'
        else r.afiliado_value is null or hs.affiliate = r.afiliado_value end)
    left join public.hotmart_sale_class sc on sc.transaction_code = hs.transaction_code
    where sc.group_id is null
    order by hs.transaction_code,
      (case when r.src_value is not null or r.src_match = 'is_empty' then 1 else 0 end +
       case when r.sck_value is not null or r.sck_match = 'is_empty' then 1 else 0 end +
       case when r.xcode_value is not null or r.xcode_match = 'is_empty' then 1 else 0 end +
       case when r.afiliado_value is not null or r.afiliado_match = 'is_empty' then 1 else 0 end) desc
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
    where
      (case r.src_match
        when 'is_empty'    then (hs.src is null or hs.src = '')
        when 'contains'    then r.src_value is not null and hs.src ilike '%' || r.src_value || '%'
        when 'starts_with' then r.src_value is not null and hs.src ilike r.src_value || '%'
        else r.src_value is null or hs.src = r.src_value end) and
      (case r.sck_match
        when 'is_empty'    then (hs.sck is null or hs.sck = '')
        when 'contains'    then r.sck_value is not null and hs.sck ilike '%' || r.sck_value || '%'
        when 'starts_with' then r.sck_value is not null and hs.sck ilike r.sck_value || '%'
        else r.sck_value is null or hs.sck = r.sck_value end) and
      (case r.xcode_match
        when 'is_empty'    then (hs.xcod is null or hs.xcod = '')
        when 'contains'    then r.xcode_value is not null and hs.xcod ilike '%' || r.xcode_value || '%'
        when 'starts_with' then r.xcode_value is not null and hs.xcod ilike r.xcode_value || '%'
        else r.xcode_value is null or hs.xcod = r.xcode_value end) and
      (case r.afiliado_match
        when 'is_empty'    then (hs.affiliate is null or hs.affiliate = '')
        when 'contains'    then r.afiliado_value is not null and hs.affiliate ilike '%' || r.afiliado_value || '%'
        when 'starts_with' then r.afiliado_value is not null and hs.affiliate ilike r.afiliado_value || '%'
        else r.afiliado_value is null or hs.affiliate = r.afiliado_value end)
  )
  insert into public.hotmart_sale_class (transaction_code, group_id, channel_id, seller_id, updated_at)
  select transaction_code, r.group_id, r.channel_id, r.seller_id, now() from matched
  on conflict (transaction_code) do update
    set group_id = excluded.group_id, channel_id = excluded.channel_id,
        seller_id = excluded.seller_id, updated_at = excluded.updated_at;
  get diagnostics affected = row_count;
  return affected;
end; $$;
