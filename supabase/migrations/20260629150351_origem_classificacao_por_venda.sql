-- ============================================================================
-- Origem v3 — classificação POR VENDA (Grupo criável › Canal criável + Vendedor)
-- ----------------------------------------------------------------------------
-- Nova abordagem (alinhada com o Luiz): a origem é marcada VENDA A VENDA na tela
-- /origem, em 3 dimensões — Grupo, Canal e Vendedor. Grupo e Canal são LISTAS QUE
-- O LUIZ CRIA (não mais enum fixo); cada Canal pertence a um Grupo. O Vendedor é a
-- lista de `sellers`. (As regras de propagação por src/sck virão depois, conforme o
-- Luiz identificar os padrões — por isso o de-para por tracking sai por ora.)
--
-- Substitui o de-para por tracking (origem v2): saem origin_tracking_map e
-- origin_sale_override; origin_channels deixa de ter `grupo` (enum) e `seller_id`.
-- Como os dados já estavam zerados, o ALTER em origin_channels é seguro.
--
-- Mantidos: hotmart_canal_base/hotmart_origin_suggest (utils), hotmart_by_affiliate,
-- hotmart_totals. View hotmart_sales_origin recriada (v4).
--
-- APLICADA: 2026-06-29 (version 20260629150351)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Derruba o que será refeito/removido (RPCs e view dependem de origin_channels)
-- ---------------------------------------------------------------------------
drop function if exists public.origin_channels_list(text);
drop function if exists public.origin_tracking_unmapped(text);
drop function if exists public.hotmart_by_group(uuid, date, date, text);
drop function if exists public.hotmart_by_channel(uuid, date, date, text);
drop function if exists public.hotmart_seller_report(uuid, date, date, text);
drop view if exists public.hotmart_sales_origin;
drop table if exists public.origin_tracking_map;
drop table if exists public.origin_sale_override;

-- ---------------------------------------------------------------------------
-- 1) Grupos criáveis
-- ---------------------------------------------------------------------------
create table public.origin_groups (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) origin_channels: `grupo` (enum) → `group_id` (FK); remove `seller_id`
--    (vendedor agora é dimensão por venda). Tabela está vazia → ALTER seguro.
-- ---------------------------------------------------------------------------
alter table public.origin_channels drop column grupo;
alter table public.origin_channels drop column seller_id;
alter table public.origin_channels drop constraint if exists origin_channels_nome_key;
alter table public.origin_channels add column group_id uuid not null references public.origin_groups(id) on delete cascade;
alter table public.origin_channels add constraint origin_channels_grupo_nome_uk unique (group_id, nome);

-- ---------------------------------------------------------------------------
-- 3) Classificação por venda (Grupo + Canal + Vendedor, todos opcionais)
-- ---------------------------------------------------------------------------
create table public.hotmart_sale_class (
  transaction_code text primary key,
  group_id   uuid references public.origin_groups(id)   on delete set null,
  channel_id uuid references public.origin_channels(id) on delete set null,
  seller_id  uuid references public.sellers(id)         on delete set null,
  updated_at timestamptz not null default now()
);

-- RLS team-model
alter table public.origin_groups     enable row level security;
alter table public.hotmart_sale_class enable row level security;
create policy authenticated_all on public.origin_groups      for all to authenticated using (true) with check (true);
create policy authenticated_all on public.hotmart_sale_class for all to authenticated using (true) with check (true);
revoke truncate, references, trigger, maintain on table public.origin_groups      from authenticated;
revoke truncate, references, trigger, maintain on table public.hotmart_sale_class from authenticated;
revoke all on table public.origin_groups      from anon;
revoke all on table public.hotmart_sale_class from anon;

-- ---------------------------------------------------------------------------
-- 4) View v4 — origem derivada da classificação por venda
--    Grupo = grupo marcado direto, senão o grupo do canal marcado, senão a_classificar.
-- ---------------------------------------------------------------------------
create view public.hotmart_sales_origin with (security_invoker = true) as
  select h.*,
    coalesce(gd.nome, gc.nome, 'a_classificar') as origem,
    ch.nome   as canal,
    sl.name   as vendedor,
    cls.group_id, cls.channel_id, cls.seller_id
  from public.hotmart_sales h
  left join public.hotmart_sale_class cls on cls.transaction_code = h.transaction_code
  left join public.origin_groups   gd on gd.id = cls.group_id
  left join public.origin_channels ch on ch.id = cls.channel_id
  left join public.origin_groups   gc on gc.id = ch.group_id
  left join public.sellers         sl on sl.id = cls.seller_id;

-- ---------------------------------------------------------------------------
-- 5) RPCs de relatório (lêem a view; mesmas assinaturas de antes p/ não quebrar telas)
-- ---------------------------------------------------------------------------
create function public.hotmart_by_group(
  p_company uuid default null, p_start date default null,
  p_end date default null, p_currency text default 'BRL'
)
returns table (grupo text, vendas bigint, bruto numeric, total numeric, liquido numeric)
language sql stable security invoker set search_path = '' as $$
  select h.origem, count(*),
         coalesce(sum(h.gross_amount),0), coalesce(sum(h.total_amount),0), coalesce(sum(h.net_amount),0)
  from public.hotmart_sales_origin h
  where h.currency = p_currency and h.status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or h.company_id = p_company)
    and (p_start is null or h.sale_date >= p_start)
    and (p_end   is null or h.sale_date <= p_end)
  group by h.origem order by 5 desc;
$$;

create function public.hotmart_by_channel(
  p_company uuid default null, p_start date default null,
  p_end date default null, p_currency text default 'BRL'
)
returns table (canal text, grupo text, vendas bigint, bruto numeric, total numeric, liquido numeric)
language sql stable security invoker set search_path = '' as $$
  select coalesce(h.canal,'(sem canal)'), h.origem, count(*),
         coalesce(sum(h.gross_amount),0), coalesce(sum(h.total_amount),0), coalesce(sum(h.net_amount),0)
  from public.hotmart_sales_origin h
  where h.currency = p_currency and h.status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or h.company_id = p_company)
    and (p_start is null or h.sale_date >= p_start)
    and (p_end   is null or h.sale_date <= p_end)
  group by h.canal, h.origem order by 5 desc;
$$;

create function public.hotmart_seller_report(
  p_company uuid default null, p_start date default null,
  p_end date default null, p_currency text default 'BRL'
)
returns table (vendedor text, vendas bigint, bruto numeric, total numeric, liquido numeric, comissao_afiliado numeric)
language sql stable security invoker set search_path = '' as $$
  select h.vendedor, count(*),
         coalesce(sum(h.gross_amount),0), coalesce(sum(h.total_amount),0),
         coalesce(sum(h.net_amount),0), coalesce(sum(h.affiliate_commission),0)
  from public.hotmart_sales_origin h
  where h.vendedor is not null
    and h.currency = p_currency and h.status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or h.company_id = p_company)
    and (p_start is null or h.sale_date >= p_start)
    and (p_end   is null or h.sale_date <= p_end)
  group by h.vendedor order by 5 desc;
$$;

revoke execute on function public.hotmart_by_group(uuid,date,date,text)     from public, anon;
revoke execute on function public.hotmart_by_channel(uuid,date,date,text)   from public, anon;
revoke execute on function public.hotmart_seller_report(uuid,date,date,text) from public, anon;
grant  execute on function public.hotmart_by_group(uuid,date,date,text)     to authenticated;
grant  execute on function public.hotmart_by_channel(uuid,date,date,text)   to authenticated;
grant  execute on function public.hotmart_seller_report(uuid,date,date,text) to authenticated;
