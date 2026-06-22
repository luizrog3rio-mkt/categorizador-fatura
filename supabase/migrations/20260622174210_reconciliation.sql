-- ============================================================================
-- Conciliação bancária — colunas de auditoria + RPCs (passo 4/4)
-- ============================================================================
-- APLICADA em 2026-06-22 via MCP apply_migration — version vivo 20260622174210
-- (renomeado do placeholder 20260622000005). Pós-apply: as 4 RPCs rodam (extrato
-- vazio -> summary 0/0/0/0, suggest vazio, sem erro). Feature inerte até importar
-- OFX numa conta corrente — por design.
--
-- Liga linha de extrato (bank_transactions) a conta a pagar/receber (entries)
-- via o hook bank_transactions.entry_id que JÁ existe desde a Fase 1c (nunca
-- exercido). Greenfield de DADO: bank_transactions vazia e entries.account_id
-- NULL hoje -> a feature fica inerte até importar OFX. O reconcile_entry faz
-- BOOTSTRAP do account_id a partir da linha do extrato (destrava saldo-via-entries).
--
-- Fixes dos críticos embutidos:
--   - 1:1 estrito: unique index parcial em bank_transactions.entry_id + guard no
--     reconcile_entry (uma entry casa com no máximo uma linha de extrato).
--   - desfazer seguro: paid_via_reconciliation marca SÓ o que a conciliação pagou;
--     unreconcile reverte apenas esses (não toca pagamento legítimo pré-existente).
--   - reconcile só marca paid se o status NÃO era 'paid' (e <> cancelled).
--   - tipos de retorno qualificados (public.entry_type) p/ robustez com search_path=''.
--   - hardening = hotmart_totals (SECURITY INVOKER, search_path='', GRANT
--     authenticated+service_role). FORA do v1: caso fatura-de-cartão (entry com
--     invoice_account_id) e conciliação parcial/agregada (N:1).
-- ============================================================================

alter table public.bank_transactions
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by uuid references public.profiles(id) on delete set null;

alter table public.entries
  add column if not exists paid_via_reconciliation boolean not null default false;

create unique index if not exists uq_bank_tx_entry on public.bank_transactions(entry_id) where entry_id is not null;

create or replace function public.reconciliation_suggest(
  p_account uuid, p_tolerance_days int default 3, p_amount_tol numeric default 0.00
) returns table (bank_tx_id uuid, bank_date date, bank_amount numeric, bank_memo text,
                 entry_id uuid, entry_desc text, entry_amount numeric, entry_due date,
                 entry_type public.entry_type, diff_days int, score int)
language sql stable security invoker set search_path = '' as $$
  select bt.id, bt.date, bt.amount, bt.memo, e.id, e.description, e.amount, e.due_date, e.type,
         abs(bt.date - e.due_date)::int as diff_days, (100 - abs(bt.date - e.due_date)::int) as score
  from public.bank_transactions bt
  join public.accounts a on a.id = bt.account_id
  join public.entries e on e.company_id = a.company_id
  where bt.account_id = p_account and bt.entry_id is null
    and e.status in ('to_pay','pending')
    and not exists (select 1 from public.bank_transactions b2 where b2.entry_id = e.id)
    and (e.account_id is null or e.account_id = bt.account_id)
    and abs(abs(bt.amount) - e.amount) <= p_amount_tol
    and ((bt.amount < 0 and e.type='payable') or (bt.amount > 0 and e.type='receivable'))
    and abs(bt.date - e.due_date) <= p_tolerance_days
  order by bt.date, score desc;
$$;
grant execute on function public.reconciliation_suggest(uuid,int,numeric) to authenticated, service_role;

create or replace function public.reconcile_entry(p_bank_tx uuid, p_entry uuid, p_mark_paid boolean default true)
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare v_date date; v_acc uuid; v_status public.entry_status;
begin
  select date, account_id into v_date, v_acc from public.bank_transactions where id = p_bank_tx;
  if exists (select 1 from public.bank_transactions where entry_id = p_entry) then
    raise exception 'Esse lançamento já está conciliado com outra linha do extrato'; end if;
  update public.bank_transactions set entry_id = p_entry, reconciled_at = now(), reconciled_by = auth.uid()
   where id = p_bank_tx and entry_id is null;
  if not found then raise exception 'Linha do extrato já conciliada ou inexistente'; end if;
  select status into v_status from public.entries where id = p_entry;
  update public.entries set account_id = coalesce(account_id, v_acc) where id = p_entry;
  if p_mark_paid and v_status is distinct from 'paid' and v_status <> 'cancelled' then
    update public.entries set status='paid', payment_date=coalesce(payment_date,v_date), paid_via_reconciliation=true
     where id = p_entry; end if;
end; $$;
grant execute on function public.reconcile_entry(uuid,uuid,boolean) to authenticated, service_role;

create or replace function public.unreconcile_entry(p_bank_tx uuid, p_revert_status boolean default true)
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare v_entry uuid;
begin
  select entry_id into v_entry from public.bank_transactions where id = p_bank_tx;
  update public.bank_transactions set entry_id=null, reconciled_at=null, reconciled_by=null where id = p_bank_tx;
  if p_revert_status and v_entry is not null then
    update public.entries set status='to_pay', payment_date=null, paid_via_reconciliation=false
     where id = v_entry and paid_via_reconciliation = true; end if;
end; $$;
grant execute on function public.unreconcile_entry(uuid,boolean) to authenticated, service_role;

create or replace function public.reconciliation_summary(p_account uuid)
 returns table (total bigint, conciliadas bigint, pendentes bigint, valor_pendente numeric)
 language sql stable security invoker set search_path = '' as $$
  select count(*), count(*) filter (where entry_id is not null), count(*) filter (where entry_id is null),
         coalesce(sum(amount) filter (where entry_id is null),0)
  from public.bank_transactions where account_id = p_account;
$$;
grant execute on function public.reconciliation_summary(uuid) to authenticated, service_role;
