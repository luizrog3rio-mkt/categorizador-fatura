-- APLICADA: 20260629161019
-- Migra origin_tracking_rules de (field, value) para colunas separadas por campo,
-- permitindo múltiplas condições AND numa mesma regra.
-- Aprovada pelo Luiz em 2026-06-29

alter table public.origin_tracking_rules
  add column src_value      text,
  add column sck_value      text,
  add column xcode_value    text,
  add column afiliado_value text;

update public.origin_tracking_rules set src_value      = value where field = 'src';
update public.origin_tracking_rules set sck_value      = value where field = 'sck';
update public.origin_tracking_rules set xcode_value    = value where field = 'xcode';
update public.origin_tracking_rules set afiliado_value = value where field = 'afiliado';

alter table public.origin_tracking_rules
  drop constraint origin_tracking_rules_field_check,
  drop column field,
  drop column value;

alter table public.origin_tracking_rules
  add constraint origin_tracking_rules_has_condition check (
    src_value is not null or sck_value is not null or
    xcode_value is not null or afiliado_value is not null
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
      (r.src_value      is null or r.src_value      = hs.src)      and
      (r.sck_value      is null or r.sck_value      = hs.sck)      and
      (r.xcode_value    is null or r.xcode_value    = hs.xcod)     and
      (r.afiliado_value is null or r.afiliado_value = hs.affiliate)
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
    where (r.src_value      is null or hs.src       = r.src_value)
      and (r.sck_value      is null or hs.sck       = r.sck_value)
      and (r.xcode_value    is null or hs.xcod      = r.xcode_value)
      and (r.afiliado_value is null or hs.affiliate = r.afiliado_value)
  )
  insert into public.hotmart_sale_class (transaction_code, group_id, channel_id, seller_id, updated_at)
  select transaction_code, r.group_id, r.channel_id, r.seller_id, now() from matched
  on conflict (transaction_code) do update
    set group_id = excluded.group_id, channel_id = excluded.channel_id,
        seller_id = excluded.seller_id, updated_at = excluded.updated_at;
  get diagnostics affected = row_count;
  return affected;
end; $$;
