-- ============================================================================
-- Fase 1c — Tabelas novas em inglês (portagem do schema do rb7-financeiro)
-- ============================================================================
-- APLICADO em 2026-06-10 via MCP `apply_migration` — version vivo 20260610160202
-- (renomeado do placeholder 20260610200000, rito padrão). Guardas passaram;
-- advisors pós-apply: exatamente os 11 WARNs 0024 previstos (6 da 1b + 5 daqui).
--
-- O que faz (numa única transação):
--   1. Cria os 3 enums e as 5 tabelas novas em EN, traduzindo o schema PT-BR
--      do rb7-financeiro (fonte: as 3 migrations do rb7 — o hardening do
--      trigger veio da 20260609180002 — + auditoria cruzada de 2026-06-09;
--      tudo versionado em supabase/audit/rb7-recovery/):
--        companies          ← empresas
--        accounts           ← contas
--        entries            ← lancamentos
--        bank_transactions  ← transacoes_ofx  (+invoice_id e auto_categorized,
--                             colunas que a auditoria mandou herdar do
--                             categorizador pro merge da Fase 4)
--        hotmart_sales      ← vendas_hotmart
--   2. Adiciona `invoices.account_id` (nullable) e aponta as 3 faturas vivas
--      pra conta nova "Cartão Sicoob RB7".
--   3. Seeds mínimos e REAIS: 1 company (RB7 Digital) + 1 account (Cartão
--      Sicoob RB7, ratificados pelo Luiz em 2026-06-10). O seed do rb7
--      (Berta, contas Sicredi/C6, empréstimos inter-empresa) era FICTÍCIO e
--      foi descartado; o tipo inter_company e counterparty_company_id ficam
--      como capacidade estrutural, sem dados.
--
-- Decisões de desenho (desvios conscientes do schema fonte):
--   - FKs com ON DELETE RESTRICT no lugar dos CASCADE do rb7 (filosofia da
--     1b: registro financeiro não morre por arrasto; deletar company/account
--     com dados falha explicitamente). FKs de vínculo fraco (category_id,
--     entry_id, invoice_id, created_by) usam SET NULL.
--   - category_id (entries/bank_transactions) referencia a tabela VIVA
--     public.categories — um único sistema de categorias na transição; a
--     dimensão tipo pagar/receber entra na Fase 3 (modelo unificado da
--     auditoria). Até lá o app TS seleciona das categorias existentes.
--   - RLS modelo de equipe desde o dia 1 (using(true)/with check(true) —
--     vão gerar 5 WARNs lint 0024 nos advisors, aceitos como na 1b).
--   - Hardening 1a embutido: revokes explícitos (anon: ALL; authenticated:
--     truncate/references/trigger/maintain — os default privileges da 1a já
--     cobririam, mas explícito documenta), função de trigger com
--     set search_path = '' e EXECUTE revogado.
--   - Sem user_id: autoria informativa via entries.created_by → profiles
--     (não-autoritativo, como documentado na 1b).
--   - UNIQUE(account_id, fit_id) em bank_transactions é o dedupe de EXTRATO
--     BANCÁRIO (rb7). ⚠️ FATURAS DE CARTÃO SICOOB NÃO PASSAM POR AQUI: o
--     FITID do Sicoob repete entre parcelas/faturas (R$ 22.475,33 de
--     parcelamentos legítimos) — o fluxo de cartão continua em
--     invoices/transactions até a Fase 4 desenhar dedupe escopado por fatura.
--   - hotmart_sales.status mantém valores PT ('aprovada') — vêm dos
--     relatórios da Hotmart e o código portado da Fase 2 os compara.
--   - invoices.account_id fica NULLABLE: o app JS atual insere invoices sem
--     a coluna; o app TS da Fase 2 passa a preenchê-la.
--
-- O que NÃO faz: não mexe em NENHUMA tabela viva além da coluna nova em
-- invoices; não cria tabela de categorias nova (Fase 3); não porta papel/
-- role de perfis (decisão da Fase 2); não migra dados de transactions
-- (Fase 4).
-- ============================================================================

-- ── 1. Enums ─────────────────────────────────────────────────────────────────

create type public.entry_type as enum ('payable', 'receivable');
create type public.entry_status as enum ('pending', 'paid', 'overdue', 'cancelled');
create type public.account_type as enum ('checking', 'credit_card', 'inter_company');

-- ── 2. Tabelas ───────────────────────────────────────────────────────────────

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null,
  type public.account_type not null default 'checking',
  bank text,
  initial_balance numeric(14,2) not null default 0,
  -- inter_company: a empresa "do outro lado" do empréstimo
  counterparty_company_id uuid references public.companies (id) on delete restrict,
  statement_closing_day int,   -- cartão de crédito
  due_day int,                 -- cartão de crédito
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_accounts_company on public.accounts (company_id);
create index idx_accounts_counterparty on public.accounts (counterparty_company_id);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  account_id uuid references public.accounts (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  type public.entry_type not null,
  description text not null,
  amount numeric(14,2) not null,
  -- fluxo de datas: emissão → vencimento → pagamento
  issue_date date not null,
  due_date date not null,
  payment_date date,
  status public.entry_status not null default 'pending',
  counterparty text,           -- fornecedor/cliente
  notes text,
  -- fatura de cartão: agrupa lançamentos de cartão no contas a pagar
  invoice_account_id uuid references public.accounts (id) on delete restrict,
  invoice_month date,          -- primeiro dia do mês da fatura
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_entries_company on public.entries (company_id);
create index idx_entries_account on public.entries (account_id);
create index idx_entries_category on public.entries (category_id);
create index idx_entries_invoice_account on public.entries (invoice_account_id);
create index idx_entries_created_by on public.entries (created_by);
create index idx_entries_due_date on public.entries (due_date);
create index idx_entries_status on public.entries (status);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete restrict,
  fit_id text not null,
  date date not null,
  amount numeric(14,2) not null,      -- COM sinal (despesa negativa)
  memo text,
  tx_type text,
  category_id uuid references public.categories (id) on delete set null,
  entry_id uuid references public.entries (id) on delete set null,       -- conciliação
  invoice_id uuid references public.invoices (id) on delete set null,    -- lote/fatura (herdado do categorizador)
  auto_categorized boolean not null default false,                       -- herdado do categorizador
  imported_at timestamptz not null default now(),
  -- dedupe de EXTRATO; cartão Sicoob NÃO entra aqui (ver header)
  unique (account_id, fit_id)
);

create index idx_bank_tx_date on public.bank_transactions (date);
create index idx_bank_tx_category on public.bank_transactions (category_id);
create index idx_bank_tx_entry on public.bank_transactions (entry_id);
create index idx_bank_tx_invoice on public.bank_transactions (invoice_id);

create table public.hotmart_sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  transaction_code text not null unique,
  product text not null,
  sale_date date not null,
  release_date date,                  -- previsão de saque
  gross_amount numeric(14,2) not null,
  hotmart_fee numeric(14,2) not null default 0,
  affiliate_commission numeric(14,2) not null default 0,
  coproduction_commission numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null,
  affiliate text,
  coproducer text,
  payment_method text,
  status text not null default 'aprovada',   -- valores PT dos relatórios Hotmart
  buyer text,
  imported_at timestamptz not null default now()
);

create index idx_hotmart_sale_date on public.hotmart_sales (sale_date);
create index idx_hotmart_company on public.hotmart_sales (company_id);

-- ── 3. Trigger updated_at em entries ────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger trg_entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

-- ── 4. RLS modelo de equipe + least privilege (padrão 1a/1b) ────────────────

alter table public.companies enable row level security;
alter table public.accounts enable row level security;
alter table public.entries enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.hotmart_sales enable row level security;

create policy "Team manages all companies" on public.companies
  for all to authenticated using (true) with check (true);
create policy "Team manages all accounts" on public.accounts
  for all to authenticated using (true) with check (true);
create policy "Team manages all entries" on public.entries
  for all to authenticated using (true) with check (true);
create policy "Team manages all bank transactions" on public.bank_transactions
  for all to authenticated using (true) with check (true);
create policy "Team manages all hotmart sales" on public.hotmart_sales
  for all to authenticated using (true) with check (true);

revoke all on table public.companies, public.accounts, public.entries,
  public.bank_transactions, public.hotmart_sales from anon;
revoke truncate, references, trigger, maintain on table public.companies,
  public.accounts, public.entries, public.bank_transactions,
  public.hotmart_sales from authenticated;

-- ── 5. Seeds (com guardas de contagem) ──────────────────────────────────────

do $$
declare
  n integer;
  v_sicoob uuid;
begin
  -- Só dados REAIS: o seed do rb7 (Berta + contas Sicredi/C6 + inter-empresa)
  -- era fictício e foi descartado por decisão do Luiz (2026-06-10).
  insert into public.companies (name) values ('RB7 Digital');
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Fase 1c abortada: seed de companies inseriu %, esperado 1', n;
  end if;

  -- A conta real: destino das 3 faturas vivas (empresa ratificada: RB7 Digital)
  insert into public.accounts (company_id, name, type, bank)
  select id, 'Cartão Sicoob RB7', 'credit_card'::public.account_type, 'Sicoob'
  from public.companies
  where name = 'RB7 Digital';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Fase 1c abortada: seed de accounts inseriu %, esperado 1', n;
  end if;

  -- ── invoices.account_id + backfill das 3 faturas vivas ──
  alter table public.invoices
    add column account_id uuid references public.accounts (id) on delete restrict;

  select id into v_sicoob from public.accounts where name = 'Cartão Sicoob RB7';
  if v_sicoob is null then
    raise exception 'Fase 1c abortada: conta Cartão Sicoob RB7 não encontrada pós-seed';
  end if;

  update public.invoices set account_id = v_sicoob;
  get diagnostics n = row_count;
  if n <> 3 then
    raise exception 'Fase 1c abortada: backfill de invoices atingiu %, esperado 3', n;
  end if;
end $$;

create index idx_invoices_account on public.invoices (account_id);
