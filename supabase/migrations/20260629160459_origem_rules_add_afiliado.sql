-- APLICADA: 20260629160459
-- Adiciona 'afiliado' como campo válido em origin_tracking_rules + atualiza as duas RPCs.
-- Aprovada pelo Luiz em 2026-06-29

alter table public.origin_tracking_rules
  drop constraint origin_tracking_rules_field_check,
  add constraint origin_tracking_rules_field_check
    check (field in ('src', 'sck', 'xcode', 'afiliado'));

create or replace function public.apply_origin_rules()
returns integer language plpgsql security definer set search_path = ''
as $$
declare affected integer;
begin
  with matched as (
    select distinct on (hs.transaction_code)
      hs.transaction_code, r.group_id, r.channel_id, r.seller_id
    from public.hotmart_sales hs
    join public.origin_tracking_rules r on
      (r.field = 'src'      and r.value = hs.src)       or
      (r.field = 'sck'      and r.value = hs.sck)       or
      (r.field = 'xcode'    and r.value = hs.xcod)      or
      (r.field = 'afiliado' and r.value = hs.affiliate)
    left join public.hotmart_sale_class sc on sc.transaction_code = hs.transaction_code
    where sc.group_id is null
    order by hs.transaction_code,
      case r.field when 'src' then 1 when 'sck' then 2 when 'xcode' then 3 else 4 end
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
returns integer language plpgsql security definer set search_path = ''
as $$
declare affected integer; r public.origin_tracking_rules;
begin
  select * into r from public.origin_tracking_rules where id = p_rule_id;
  if not found then return 0; end if;
  with matched as (
    select hs.transaction_code from public.hotmart_sales hs
    where (r.field = 'src'      and hs.src       = r.value)
       or (r.field = 'sck'      and hs.sck       = r.value)
       or (r.field = 'xcode'    and hs.xcod      = r.value)
       or (r.field = 'afiliado' and hs.affiliate = r.value)
  )
  insert into public.hotmart_sale_class (transaction_code, group_id, channel_id, seller_id, updated_at)
  select transaction_code, r.group_id, r.channel_id, r.seller_id, now() from matched
  on conflict (transaction_code) do update
    set group_id = excluded.group_id, channel_id = excluded.channel_id,
        seller_id = excluded.seller_id, updated_at = excluded.updated_at;
  get diagnostics affected = row_count;
  return affected;
end; $$;
