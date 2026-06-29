-- APLICADA: 20260629155027
-- origin_tracking_rules: regras persistentes de propagação por campo de tracking (src/sck/xcode)
-- Aprovada pelo Luiz em 2026-06-29

create table public.origin_tracking_rules (
  id          uuid        primary key default gen_random_uuid(),
  field       text        not null check (field in ('src', 'sck', 'xcode')),
  value       text        not null,
  group_id    uuid        references public.origin_groups(id) on delete set null,
  channel_id  uuid        references public.origin_channels(id) on delete set null,
  seller_id   uuid        references public.sellers(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (field, value)
);

alter table public.origin_tracking_rules enable row level security;
create policy "team_all" on public.origin_tracking_rules
  for all to authenticated using (true) with check (true);

-- RPC: aplica regras às vendas sem classificação de grupo (prioridade src > sck > xcode)
create or replace function public.apply_origin_rules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  with matched as (
    select distinct on (hs.transaction_code)
      hs.transaction_code,
      r.group_id,
      r.channel_id,
      r.seller_id
    from public.hotmart_sales hs
    join public.origin_tracking_rules r on
      (r.field = 'src'   and r.value = hs.src)  or
      (r.field = 'sck'   and r.value = hs.sck)  or
      (r.field = 'xcode' and r.value = hs.xcod)
    left join public.hotmart_sale_class sc
      on sc.transaction_code = hs.transaction_code
    where sc.group_id is null
    order by hs.transaction_code,
             case r.field when 'src' then 1 when 'sck' then 2 else 3 end
  )
  insert into public.hotmart_sale_class
    (transaction_code, group_id, channel_id, seller_id, updated_at)
  select transaction_code, group_id, channel_id, seller_id, now()
  from matched
  on conflict (transaction_code) do update
    set group_id   = excluded.group_id,
        channel_id = excluded.channel_id,
        seller_id  = excluded.seller_id,
        updated_at = excluded.updated_at
    where public.hotmart_sale_class.group_id is null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.apply_origin_rules() to authenticated;
