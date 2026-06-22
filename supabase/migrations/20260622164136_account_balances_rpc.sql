-- ============================================================================
-- Controle de saldo em conta — RPCs account_balances + account_ledger
-- ============================================================================
-- APLICADA em 2026-06-22 via MCP apply_migration — version vivo 20260622164136
-- (renomeado do placeholder 20260622000002). Pós-apply: account_balances(null)
-- devolve as 2 contas com saldo=0/fonte='inicial' e account_ledger volta vazio
-- (esperado — 0 OFX, 0 entries pagas com conta, initial_balance=0).
--
-- O que faz (sem mudar NENHUMA tabela/coluna — só 2 funções + 2 índices):
--   1. account_balances(p_company): saldo por conta no BANCO, aplicando a regra
--      anti-dupla-contagem que hoje vive no cliente (Contas.tsx:48-76):
--      saldo = initial_balance + (checking COM OFX ? soma(bank_transactions.amount)
--      : soma(entries status='paid', payable=-amount/receivable=+amount)). Mata o
--      bug do .in() client-side que TRUNCA silenciosamente em 1000 linhas (PostgREST).
--   2. account_ledger(p_account, p_start, p_end): extrato de uma conta com saldo
--      acumulado (running balance calculado sobre TODOS os movimentos e só DEPOIS
--      filtrado por período, então o saldo é o real na data). Desempate intra-dia
--      por (data, imported_at/created_at, id) — não por UUID aleatório.
--   3. Índices de apoio (baixa urgência hoje; idx_bank_tx_account_date é o mesmo
--      que a Conciliação usaria — criado uma vez só aqui).
--
-- Hardening = espelha a hotmart_totals VIVA (verificado no banco): LANGUAGE sql,
-- STABLE, SECURITY INVOKER (herda RLS de equipe using(true)), SET search_path='',
-- referência sempre public.<tabela>, GRANT EXECUTE a authenticated+service_role
-- (PUBLIC mantém o execute default, inofensivo: a RLS é 'to authenticated').
-- Tipos de retorno qualificados (public.account_type) p/ não depender do search_path
-- da sessão que aplica.
-- ============================================================================

-- RPC 1: saldo por conta (regra OFX-XOR-lançamentos-pagos, no banco)
create or replace function public.account_balances(p_company uuid default null)
returns table (account_id uuid, name text, type public.account_type,
               initial_balance numeric, movimento numeric, saldo numeric, fonte text)
language sql stable security invoker set search_path = '' as $$
  with acc as (
    select a.id, a.name, a.type, a.initial_balance,
           exists(select 1 from public.bank_transactions b where b.account_id = a.id) as tem_ofx
    from public.accounts a
    where (p_company is null or a.company_id = p_company)
  ),
  ofx  as (select b.account_id, sum(b.amount) mov from public.bank_transactions b group by b.account_id),
  lanc as (select e.account_id, sum(case when e.type='payable' then -e.amount else e.amount end) mov
           from public.entries e where e.status='paid' and e.account_id is not null group by e.account_id)
  select acc.id, acc.name, acc.type, acc.initial_balance,
         case when acc.type='checking' and acc.tem_ofx then coalesce(ofx.mov,0) else coalesce(lanc.mov,0) end,
         acc.initial_balance + case when acc.type='checking' and acc.tem_ofx then coalesce(ofx.mov,0) else coalesce(lanc.mov,0) end,
         case when acc.type='checking' and acc.tem_ofx then 'ofx'
              when coalesce(lanc.mov,0) <> 0 then 'entries' else 'inicial' end
  from acc
  left join ofx  on ofx.account_id  = acc.id
  left join lanc on lanc.account_id = acc.id
  order by acc.name;
$$;
grant execute on function public.account_balances(uuid) to authenticated, service_role;

-- RPC 2: extrato de uma conta com saldo acumulado (running balance real na data)
create or replace function public.account_ledger(p_account uuid, p_start date default null, p_end date default null)
returns table (data date, descricao text, amount numeric, saldo_acumulado numeric, fonte text, origem_id uuid)
language sql stable security invoker set search_path = '' as $$
  with a as (select id, type, initial_balance,
                    exists(select 1 from public.bank_transactions b where b.account_id = id) tem_ofx
             from public.accounts where id = p_account),
  movs as (
    select b.date data, coalesce(b.memo,b.tx_type) descricao, b.amount amount,
           'ofx'::text fonte, b.id origem_id, b.imported_at ord
    from public.bank_transactions b, a
    where a.type='checking' and a.tem_ofx and b.account_id = p_account
    union all
    select coalesce(e.payment_date,e.due_date), e.description,
           case when e.type='payable' then -e.amount else e.amount end,
           'entries', e.id, e.created_at
    from public.entries e, a
    where not (a.type='checking' and a.tem_ofx) and e.account_id = p_account and e.status='paid'
  ),
  ordered as (
    select m.*, (select initial_balance from a)
           + sum(m.amount) over (order by m.data, m.ord, m.origem_id
                                 rows between unbounded preceding and current row) saldo_acumulado
    from movs m
  )
  select data, descricao, amount, saldo_acumulado, fonte, origem_id from ordered
  where (p_start is null or data >= p_start) and (p_end is null or data <= p_end)
  order by data, ord, origem_id;
$$;
grant execute on function public.account_ledger(uuid, date, date) to authenticated, service_role;

-- índices de apoio (baixa urgência hoje — 0 linhas — mas baratos)
create index if not exists idx_bank_tx_account_date on public.bank_transactions (account_id, date);
create index if not exists idx_entries_account_paid  on public.entries (account_id) where status = 'paid';
