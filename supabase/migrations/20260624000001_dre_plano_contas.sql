-- ============================================================================
-- Migration: DRE completa - plano de contas, produtos, competência, parcelas, auditoria, períodos fechados
-- ============================================================================
-- PLACEHOLDER — após apply_migration, renomear com o version real e anotar APLICADA
--
-- O que faz (numa única transação, exceto o ADD VALUE que é pré-transação):
--   1. Adiciona 'refunded' ao enum public.entry_status
--   2. Cria public.chart_of_accounts e seed completo (infoprodutor, 40 linhas)
--   3. Cria public.dre_products e seed (12 produtos)
--   4. Adiciona 7 colunas a public.entries (competency_date, chart_of_account_id,
--      dre_product_id, refund_of_entry_id, parent_entry_id, appropriation_month,
--      appropriation_total_months)
--   5. Cria public.entry_installments (parcelas de caixa por venda)
--   6. Cria public.closed_periods (trava mensal por empresa)
--   7. Cria public.entry_audit_log + trigger AFTER UPDATE em entries
--   8. RPC public.dre_by_competency (pivot anual por conta contábil)
--   9. RPC public.dre_cash_reconciliation (competência vs caixa por mês)
--
-- Nota: ALTER TYPE ... ADD VALUE não pode ser executado dentro de uma transação
-- que EXECUTE o novo valor em DML imediato. Aqui o valor 'refunded' só aparece
-- em corpos de função plpgsql (strings) que são avaliados na chamada, não na
-- definição — por isso é seguro em arquivo único. O padrão do projeto já usou
-- esta abordagem em 20260615132218.
-- ============================================================================

-- ── 0. enum entry_status: adicionar 'refunded' ───────────────────────────────
-- Deve vir ANTES de qualquer outro DDL para garantir que o valor existe
-- quando as funções forem chamadas pela primeira vez.

alter type public.entry_status add value if not exists 'refunded' after 'cancelled';

-- ── 1. chart_of_accounts ─────────────────────────────────────────────────────

create table if not exists public.chart_of_accounts (
  id            uuid        primary key default gen_random_uuid(),
  code          text        not null unique,
  name          text        not null,
  parent_id     uuid        references public.chart_of_accounts(id) on delete restrict,
  nature        text        not null
                            check (nature in ('revenue','deduction','variable_cost','fixed_cost',
                                              'financial','depreciation','tax')),
  is_analytical boolean     not null default true,
  sort_order    int         not null default 0,
  active        boolean     not null default true,
  created_at    timestamptz not null default now()
);

alter table public.chart_of_accounts enable row level security;

create policy "authenticated all" on public.chart_of_accounts
  for all to authenticated using (true) with check (true);

revoke truncate, references, trigger, maintain
  on table public.chart_of_accounts from authenticated;
revoke all on table public.chart_of_accounts from anon;

-- Seed: plano de contas para infoprodutor (inserção em ordem topológica)
do $$
declare
  id_1  uuid; -- 1  RECEITAS
  id_11 uuid; -- 1.1 Receita Bruta
  id_12 uuid; -- 1.2 Deduções
  id_2  uuid; -- 2  CUSTOS VARIÁVEIS
  id_3  uuid; -- 3  DESPESAS FIXAS
  id_31 uuid; -- 3.1 Pessoal
  id_32 uuid; -- 3.2 Infraestrutura
  id_33 uuid; -- 3.3 Marketing Fixo
  id_34 uuid; -- 3.4 Administrativo
  id_4  uuid; -- 4  DESPESAS FINANCEIRAS
  id_5  uuid; -- 5  DEPRECIAÇÃO
  id_6  uuid; -- 6  IMPOSTOS SOBRE LUCRO
begin

  -- Nível 1: grupos raiz
  insert into public.chart_of_accounts (code, name, nature, is_analytical, sort_order)
    values ('1', 'RECEITAS', 'revenue', false, 10)
    returning id into id_1;

  insert into public.chart_of_accounts (code, name, nature, is_analytical, sort_order)
    values ('2', 'CUSTOS VARIÁVEIS', 'variable_cost', false, 20)
    returning id into id_2;

  insert into public.chart_of_accounts (code, name, nature, is_analytical, sort_order)
    values ('3', 'DESPESAS FIXAS', 'fixed_cost', false, 30)
    returning id into id_3;

  insert into public.chart_of_accounts (code, name, nature, is_analytical, sort_order)
    values ('4', 'DESPESAS FINANCEIRAS', 'financial', false, 40)
    returning id into id_4;

  insert into public.chart_of_accounts (code, name, nature, is_analytical, sort_order)
    values ('5', 'DEPRECIAÇÃO', 'depreciation', false, 50)
    returning id into id_5;

  insert into public.chart_of_accounts (code, name, nature, is_analytical, sort_order)
    values ('6', 'IMPOSTOS SOBRE LUCRO', 'tax', false, 60)
    returning id into id_6;

  -- 1.1 Receita Bruta / 1.2 Deduções
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order)
    values ('1.1', 'Receita Bruta', id_1, 'revenue', false, 11)
    returning id into id_11;

  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order)
    values ('1.2', 'Deduções', id_1, 'deduction', false, 12)
    returning id into id_12;

  -- 1.1.xx receitas analíticas
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order) values
    ('1.1.01', 'Mentoria Individual', id_11, 'revenue', true, 1101),
    ('1.1.02', 'Apruma',              id_11, 'revenue', true, 1102),
    ('1.1.03', 'Trampolim',           id_11, 'revenue', true, 1103),
    ('1.1.04', 'Colheita',            id_11, 'revenue', true, 1104),
    ('1.1.05', 'Cursos',              id_11, 'revenue', true, 1105),
    ('1.1.06', 'Ebooks',              id_11, 'revenue', true, 1106),
    ('1.1.07', 'Livros',              id_11, 'revenue', true, 1107),
    ('1.1.08', 'Recorrência',         id_11, 'revenue', true, 1108),
    ('1.1.09', 'Palestras',           id_11, 'revenue', true, 1109),
    ('1.1.10', 'Publicidade',         id_11, 'revenue', true, 1110),
    ('1.1.11', 'Outras Receitas',     id_11, 'revenue', true, 1111);

  -- 1.2.xx deduções analíticas
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order) values
    ('1.2.01', 'Impostos sobre Vendas (ISS/ICMS/PIS-COFINS)', id_12, 'deduction', true, 1201),
    ('1.2.02', 'Taxas de Plataforma (Hotmart/TMB)',           id_12, 'deduction', true, 1202),
    ('1.2.03', 'Taxas de Adquirência/Gateway',                id_12, 'deduction', true, 1203),
    ('1.2.04', 'Reembolsos e Chargebacks',                    id_12, 'deduction', true, 1204);

  -- 2.x custos variáveis (folha direta, sem subgrupo)
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order) values
    ('2.1', 'Tráfego Pago',                                id_2, 'variable_cost', true, 2100),
    ('2.2', 'Comissões (Afiliados/Coprodução/Closers/SDR)', id_2, 'variable_cost', true, 2200),
    ('2.3', 'CPV Produtos Físicos/Impressão',               id_2, 'variable_cost', true, 2300),
    ('2.4', 'Ferramentas Variáveis',                        id_2, 'variable_cost', true, 2400);

  -- 3.1 Pessoal
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order)
    values ('3.1', 'Pessoal', id_3, 'fixed_cost', false, 3100)
    returning id into id_31;

  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order) values
    ('3.1.01', 'Salários e Encargos',      id_31, 'fixed_cost', true, 3101),
    ('3.1.02', '13º Salário Provisionado', id_31, 'fixed_cost', true, 3102),
    ('3.1.03', 'Férias Provisionadas',      id_31, 'fixed_cost', true, 3103);

  -- 3.2 Infraestrutura
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order)
    values ('3.2', 'Infraestrutura', id_3, 'fixed_cost', false, 3200)
    returning id into id_32;

  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order) values
    ('3.2.01', 'Aluguel',                    id_32, 'fixed_cost', true, 3201),
    ('3.2.02', 'Software/Ferramentas Fixas',  id_32, 'fixed_cost', true, 3202),
    ('3.2.03', 'Internet/Telefone',           id_32, 'fixed_cost', true, 3203);

  -- 3.3 Marketing Fixo
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order)
    values ('3.3', 'Marketing Fixo', id_3, 'fixed_cost', false, 3300)
    returning id into id_33;

  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order) values
    ('3.3.01', 'Agência/Consultoria', id_33, 'fixed_cost', true, 3301);

  -- 3.4 Administrativo
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order)
    values ('3.4', 'Administrativo', id_3, 'fixed_cost', false, 3400)
    returning id into id_34;

  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order) values
    ('3.4.01', 'Contabilidade/Jurídico',  id_34, 'fixed_cost', true, 3401),
    ('3.4.02', 'Seguros',                  id_34, 'fixed_cost', true, 3402),
    ('3.4.03', 'Outros Administrativos',   id_34, 'fixed_cost', true, 3403);

  -- 4.x Despesas Financeiras (sem subgrupo intermediário)
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order) values
    ('4.1.01', 'Juros Bancários',        id_4, 'financial',    true, 4101),
    ('4.1.02', 'IOF/Tarifas Bancárias',  id_4, 'financial',    true, 4102);

  -- 5.x Depreciação
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order) values
    ('5.1.01', 'Depreciação de Equipamentos', id_5, 'depreciation', true, 5101);

  -- 6.x Impostos sobre Lucro
  insert into public.chart_of_accounts (code, name, parent_id, nature, is_analytical, sort_order) values
    ('6.1.01', 'IRPJ', id_6, 'tax', true, 6101),
    ('6.1.02', 'CSLL', id_6, 'tax', true, 6102);

end $$;

-- ── 2. dre_products ──────────────────────────────────────────────────────────

create table if not exists public.dre_products (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        references public.companies(id) on delete cascade,
  name       text        not null,
  active     boolean     not null default true,
  sort_order int         not null default 0,
  created_at timestamptz not null default now()
);

alter table public.dre_products enable row level security;

create policy "authenticated all" on public.dre_products
  for all to authenticated using (true) with check (true);

revoke truncate, references, trigger, maintain
  on table public.dre_products from authenticated;
revoke all on table public.dre_products from anon;

insert into public.dre_products (name, sort_order) values
  ('Mentoria Individual',  1),
  ('Apruma',               2),
  ('Trampolim',            3),
  ('Colheita',             4),
  ('Cursos',               5),
  ('Ebooks',               6),
  ('Livros',               7),
  ('Recorrência',          8),
  ('Palestras',            9),
  ('Publicidade',         10),
  ('Não Rateado',         11),
  ('Outras',              12);

-- ── 3. entries: novos campos ─────────────────────────────────────────────────

alter table public.entries
  add column if not exists competency_date             date,
  add column if not exists chart_of_account_id         uuid
    references public.chart_of_accounts(id) on delete set null,
  add column if not exists dre_product_id              uuid
    references public.dre_products(id) on delete set null,
  add column if not exists refund_of_entry_id          uuid
    references public.entries(id) on delete set null,
  add column if not exists parent_entry_id             uuid
    references public.entries(id) on delete set null,
  add column if not exists appropriation_month         int,
  add column if not exists appropriation_total_months  int;

create index if not exists idx_entries_chart_of_account
  on public.entries (chart_of_account_id);
create index if not exists idx_entries_dre_product
  on public.entries (dre_product_id);
create index if not exists idx_entries_competency_date
  on public.entries (competency_date);

-- ── 4. entry_installments ────────────────────────────────────────────────────

create table if not exists public.entry_installments (
  id                 uuid          primary key default gen_random_uuid(),
  entry_id           uuid          not null references public.entries(id) on delete cascade,
  installment_number int           not null,
  due_date           date          not null,
  amount             numeric(14,2) not null,
  payment_date       date,
  status             text          not null default 'to_pay'
                                   check (status in ('to_pay', 'paid', 'cancelled')),
  created_at         timestamptz   not null default now()
);

create index if not exists idx_entry_installments_entry
  on public.entry_installments (entry_id);

alter table public.entry_installments enable row level security;

create policy "authenticated all" on public.entry_installments
  for all to authenticated using (true) with check (true);

revoke truncate, references, trigger, maintain
  on table public.entry_installments from authenticated;
revoke all on table public.entry_installments from anon;

-- ── 5. closed_periods ────────────────────────────────────────────────────────

create table if not exists public.closed_periods (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references public.companies(id) on delete cascade,
  period     text        not null check (period ~ '^\d{4}-\d{2}$'),
  closed_at  timestamptz not null default now(),
  closed_by  uuid        references auth.users(id) on delete set null,
  unique (company_id, period)
);

alter table public.closed_periods enable row level security;

create policy "authenticated select" on public.closed_periods
  for select to authenticated using (true);

create policy "authenticated insert" on public.closed_periods
  for insert to authenticated with check (true);

create policy "authenticated delete" on public.closed_periods
  for delete to authenticated using (true);

revoke truncate, references, trigger, maintain
  on table public.closed_periods from authenticated;
revoke all on table public.closed_periods from anon;

-- ── 6. entry_audit_log ───────────────────────────────────────────────────────

create table if not exists public.entry_audit_log (
  id         uuid        primary key default gen_random_uuid(),
  entry_id   uuid        not null references public.entries(id) on delete cascade,
  changed_by uuid        references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  field_name text        not null,
  old_value  text,
  new_value  text
);

create index if not exists idx_entry_audit_log_entry
  on public.entry_audit_log (entry_id);
create index if not exists idx_entry_audit_log_changed_at
  on public.entry_audit_log (changed_at);

alter table public.entry_audit_log enable row level security;

-- Authenticated pode apenas ler; INSERT é exclusivo do trigger (SECURITY DEFINER)
create policy "authenticated select" on public.entry_audit_log
  for select to authenticated using (true);

revoke truncate, references, trigger, maintain
  on table public.entry_audit_log from authenticated;
revoke all on table public.entry_audit_log from anon;

-- Trigger de auditoria — SECURITY DEFINER garante bypass do RLS na tabela de log
create or replace function public.entry_audit_log_fn()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();

  if old.status is distinct from new.status then
    insert into public.entry_audit_log (entry_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_uid, 'status', old.status::text, new.status::text);
  end if;

  if old.amount is distinct from new.amount then
    insert into public.entry_audit_log (entry_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_uid, 'amount', old.amount::text, new.amount::text);
  end if;

  if old.competency_date is distinct from new.competency_date then
    insert into public.entry_audit_log (entry_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_uid, 'competency_date',
            old.competency_date::text, new.competency_date::text);
  end if;

  if old.due_date is distinct from new.due_date then
    insert into public.entry_audit_log (entry_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_uid, 'due_date', old.due_date::text, new.due_date::text);
  end if;

  if old.chart_of_account_id is distinct from new.chart_of_account_id then
    insert into public.entry_audit_log (entry_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_uid, 'chart_of_account_id',
            old.chart_of_account_id::text, new.chart_of_account_id::text);
  end if;

  if old.dre_product_id is distinct from new.dre_product_id then
    insert into public.entry_audit_log (entry_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_uid, 'dre_product_id',
            old.dre_product_id::text, new.dre_product_id::text);
  end if;

  if old.description is distinct from new.description then
    insert into public.entry_audit_log (entry_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_uid, 'description', old.description, new.description);
  end if;

  if old.counterparty is distinct from new.counterparty then
    insert into public.entry_audit_log (entry_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_uid, 'counterparty', old.counterparty, new.counterparty);
  end if;

  return new;
end; $$;

drop trigger if exists entry_audit_log_tg on public.entries;
create trigger entry_audit_log_tg
  after update on public.entries
  for each row execute function public.entry_audit_log_fn();

-- ── 7. RPC dre_by_competency ─────────────────────────────────────────────────
-- Retorna todas as contas ativas do plano (grupos + analíticas). Para as
-- analíticas, as colunas m1..m12 trazem a soma dos lançamentos no mês de
-- competência. Grupos retornam zeros — o frontend soma os filhos.
-- type='receivable' → nature revenue/deduction; type='payable' → demais naturas.

create or replace function public.dre_by_competency(
  p_company_id  uuid,
  p_year        int,
  p_month_from  int default 1,
  p_month_to    int default 12
) returns table (
  account_code  text,
  account_name  text,
  parent_code   text,
  nature        text,
  is_analytical boolean,
  sort_order    int,
  m1   numeric, m2   numeric, m3   numeric, m4   numeric,
  m5   numeric, m6   numeric, m7   numeric, m8   numeric,
  m9   numeric, m10  numeric, m11  numeric, m12  numeric,
  total         numeric
)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  select
    coa.code,
    coa.name,
    parent.code,
    coa.nature,
    coa.is_analytical,
    coa.sort_order,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 1
                      then e.amount end), 0::numeric) as m1,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 2
                      then e.amount end), 0::numeric) as m2,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 3
                      then e.amount end), 0::numeric) as m3,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 4
                      then e.amount end), 0::numeric) as m4,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 5
                      then e.amount end), 0::numeric) as m5,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 6
                      then e.amount end), 0::numeric) as m6,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 7
                      then e.amount end), 0::numeric) as m7,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 8
                      then e.amount end), 0::numeric) as m8,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 9
                      then e.amount end), 0::numeric) as m9,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 10
                      then e.amount end), 0::numeric) as m10,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 11
                      then e.amount end), 0::numeric) as m11,
    coalesce(sum(case when extract(month from coalesce(e.competency_date, e.issue_date))::int = 12
                      then e.amount end), 0::numeric) as m12,
    coalesce(sum(e.amount), 0::numeric) as total
  from public.chart_of_accounts coa
  left join public.chart_of_accounts parent on parent.id = coa.parent_id
  left join public.entries e on
        e.chart_of_account_id = coa.id
    and e.company_id = p_company_id
    and e.status not in ('cancelled', 'refunded')
    and coalesce(e.competency_date, e.issue_date) is not null
    and extract(year  from coalesce(e.competency_date, e.issue_date))::int = p_year
    and extract(month from coalesce(e.competency_date, e.issue_date))::int
          between p_month_from and p_month_to
    and (
         (coa.nature in ('revenue', 'deduction')
            and e.type = 'receivable')
      or (coa.nature in ('variable_cost', 'fixed_cost', 'financial', 'depreciation', 'tax')
            and e.type = 'payable')
    )
  where coa.active = true
  group by coa.id, coa.code, coa.name, parent.code,
           coa.nature, coa.is_analytical, coa.sort_order
  order by coa.sort_order, coa.code;
end; $$;

grant execute on function public.dre_by_competency(uuid, int, int, int)
  to authenticated;

-- ── 8. RPC dre_cash_reconciliation ───────────────────────────────────────────
-- Compara regime de competência (COALESCE(competency_date, issue_date))
-- com regime de caixa (payment_date) mês a mês, devolvendo 12 linhas fixas.
-- difference = dre_net - cash_net (positivo = receita/despesa reconhecida mas
-- ainda não realizada no caixa naquele mês).

create or replace function public.dre_cash_reconciliation(
  p_company_id uuid,
  p_year       int
) returns table (
  month_num       int,
  month_label     text,
  dre_receivable  numeric,
  dre_payable     numeric,
  cash_receivable numeric,
  cash_payable    numeric,
  dre_net         numeric,
  cash_net        numeric,
  difference      numeric
)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with months as (
    select generate_series(1, 12) as mn
  ),
  dre_agg as (
    select
      extract(month from coalesce(e.competency_date, e.issue_date))::int   as mn,
      sum(case when e.type = 'receivable' then e.amount else 0 end)         as dre_rec,
      sum(case when e.type = 'payable'    then e.amount else 0 end)         as dre_pay
    from public.entries e
    where e.company_id = p_company_id
      and e.status not in ('cancelled', 'refunded')
      and coalesce(e.competency_date, e.issue_date) is not null
      and extract(year from coalesce(e.competency_date, e.issue_date))::int = p_year
    group by 1
  ),
  cash_agg as (
    select
      extract(month from e.payment_date)::int                               as mn,
      sum(case when e.type = 'receivable' then e.amount else 0 end)         as cash_rec,
      sum(case when e.type = 'payable'    then e.amount else 0 end)         as cash_pay
    from public.entries e
    where e.company_id = p_company_id
      and e.status = 'paid'
      and e.payment_date is not null
      and extract(year from e.payment_date)::int = p_year
    group by 1
  )
  select
    m.mn::int,
    to_char(make_date(p_year, m.mn, 1), 'Mon/YYYY'),
    coalesce(d.dre_rec,  0::numeric),
    coalesce(d.dre_pay,  0::numeric),
    coalesce(c.cash_rec, 0::numeric),
    coalesce(c.cash_pay, 0::numeric),
    coalesce(d.dre_rec,  0::numeric) - coalesce(d.dre_pay,  0::numeric),
    coalesce(c.cash_rec, 0::numeric) - coalesce(c.cash_pay, 0::numeric),
    (coalesce(d.dre_rec,  0::numeric) - coalesce(d.dre_pay,  0::numeric))
    - (coalesce(c.cash_rec, 0::numeric) - coalesce(c.cash_pay, 0::numeric))
  from months m
  left join dre_agg  d on d.mn = m.mn
  left join cash_agg c on c.mn = m.mn
  order by m.mn;
end; $$;

grant execute on function public.dre_cash_reconciliation(uuid, int)
  to authenticated;
