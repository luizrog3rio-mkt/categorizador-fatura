-- ============================================================================
-- entries: juros, multa e desconto (encargos de pagamento) + Resultado Financeiro
-- ============================================================================
-- APLICADA em 2026-06-23 via MCP apply_migration — version vivo 20260623135902
-- (renomeado do placeholder 20260623000001, rito padrão). SQL revisado e aprovado
-- pelo Luiz em 2026-06-23. Smoke pós-apply ✅ (testes com ROLLBACK forçado, zero
-- dado deixado em produção): 3 colunas com default 0 + CHECK >= 0; delta de saldo de
-- conta paga com encargos = -1060,00 (=-(1000+50+30-20)); aporte na DRE Resultado
-- Financeiro = +60,00 (juros+multa +80, desconto -20). Advisors: nenhum achado novo
-- (security = os 11 WARN rls_policy_always_true de equipe já aceitos; performance só
-- INFOs pré-existentes).
--
-- O que faz (uma transação):
--   1. entries ganha 3 colunas magnitude (>= 0, default 0):
--        interest_amount (juros de mora), fine_amount (multa), discount_amount (desconto).
--      Valor efetivamente pago/recebido = amount + interest + fine - discount.
--      Vale pra 'payable' e 'receivable'; o SINAL de caixa segue vindo do type
--      (payable abate, receivable soma), exatamente como já era com amount.
--   2. account_balances / account_ledger: o movimento de uma entry PAGA passa a usar
--      o valor com encargos/desconto, não o amount original — senão o saldo da conta
--      não fecha com o extrato real (você pagou o boleto com juros, o banco debitou
--      o valor cheio).
--   3. dre_competencia: novo aporte ao bloco "Resultado Financeiro" (que a cascata do
--      frontend já SUBTRAI do EBITDA). Sinais:
--        - juros+multa: despesa financeira p/ 'payable'  (+, reduz o lucro);
--                       receita  financeira p/ 'receivable' (−, aumenta o lucro:
--                       mora que você cobrou do cliente atrasado).
--        - desconto: o espelho (payable −, é ganho; receivable +, é custo do desconto
--          concedido).
--      O amount ORIGINAL continua indo pra categoria/dre_group de origem (competência
--      por due_date), como hoje — sem dupla contagem.
--
-- O que NÃO toca:
--   - relatorio_categorias: "gasto por categoria" fica no valor de FACE (o delta de
--     caixa vive no saldo e no Resultado Financeiro da DRE) — decisão consciente.
--   - reconciliation_*: a conciliação casa pelo amount de face com tolerância; capturar
--     o delta (extrato − entry) automaticamente nos encargos fica como follow-up.
--
-- Hardening das RPCs preservado byte-a-byte do que está vivo: LANGUAGE sql, STABLE,
-- SECURITY INVOKER, set search_path='', referência sempre public.<tabela>, GRANT a
-- authenticated+service_role. RLS de equipe (using(true)) já cobre as colunas novas
-- (sem policy nova). As 3 colunas são aditivas com default 0 → backfill trivial.
-- ============================================================================

-- ── 1. Colunas ───────────────────────────────────────────────────────────────

alter table public.entries
  add column if not exists interest_amount numeric(14,2) not null default 0,
  add column if not exists fine_amount     numeric(14,2) not null default 0,
  add column if not exists discount_amount numeric(14,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entries_charges_nonneg') then
    alter table public.entries add constraint entries_charges_nonneg
      check (interest_amount >= 0 and fine_amount >= 0 and discount_amount >= 0);
  end if;
end $$;

-- ── 2. account_balances: saldo usa o valor pago (amount + encargos − desconto) ──

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
  lanc as (select e.account_id,
                  sum((case when e.type='payable' then -1 else 1 end)
                      * (e.amount + e.interest_amount + e.fine_amount - e.discount_amount)) mov
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

-- ── 3. account_ledger: o movimento da entry paga usa o valor com encargos/desconto ──

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
           (case when e.type='payable' then -1 else 1 end)
             * (e.amount + e.interest_amount + e.fine_amount - e.discount_amount),
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

-- ── 4. dre_competencia: aporte ao bloco "Resultado Financeiro" ──────────────────

create or replace function public.dre_competencia(
  p_company uuid default null, p_start date default null, p_end date default null, p_currency text default 'BRL'
) returns table (bloco text, categoria text, valor numeric)
language sql stable security invoker set search_path = '' as $$
  with cats as (
    select distinct on (lower(btrim(name))) lower(btrim(name)) as chave, name, dre_group
    from public.categories order by lower(btrim(name)), created_at
  ),
  desp as (
    select coalesce(cc.dre_group,'Não classificado') as bloco,
           coalesce(cc.name, nullif(btrim(t.category),''),'Sem categoria') as categoria,
           case when t.kind='credit' then -t.amount else t.amount end as valor
    from public.transactions t left join cats cc on cc.chave = lower(btrim(t.category))
    where t.date ~ '^[0-3][0-9]/[0-1][0-9]/[0-9]{4}$'
      and (p_start is null or to_date(t.date,'DD/MM/YYYY') >= p_start)
      and (p_end   is null or to_date(t.date,'DD/MM/YYYY') <= p_end)
    union all
    select coalesce(c.dre_group,'Não classificado'),
           coalesce(c.name,'Sem categoria'), e.amount
    from public.entries e left join public.categories c on c.id = e.category_id
    where e.status <> 'cancelled' and e.invoice_account_id is null
      and (p_company is null or e.company_id = p_company)
      and (p_start is null or e.due_date >= p_start) and (p_end is null or e.due_date <= p_end)
  )
  select bloco, categoria, sum(valor) from desp group by bloco, categoria
  union all
  select 'Receita Bruta', 'Hotmart: ' || btrim(product), sum(gross_amount)
  from public.hotmart_sales
  where currency = p_currency and status ~* 'aprovad|complet|conclu|approved'
    and (p_company is null or company_id = p_company)
    and (p_start is null or sale_date >= p_start) and (p_end is null or sale_date <= p_end)
  group by btrim(product)
  union all
  select 'Dedução','Taxas Hotmart', taxas + afiliados
  from public.hotmart_totals(p_company,p_start,p_end,p_currency) where taxas + afiliados > 0
  union all
  -- Encargos/descontos das contas a pagar/receber. O bloco é SUBTRAÍDO na cascata:
  -- payable juros/multa entram + (despesa fin.) e desconto − (ganho); receivable é o
  -- espelho. amount=0 até o pagamento → os filtros > 0 só pegam o que foi preenchido.
  select 'Resultado Financeiro', fin.categoria, sum(fin.valor)
  from (
    select 'Juros e multa'::text as categoria,
           (case when e.type='payable' then 1 else -1 end) * (e.interest_amount + e.fine_amount) as valor
    from public.entries e
    where e.status <> 'cancelled' and e.invoice_account_id is null
      and (e.interest_amount + e.fine_amount) > 0
      and (p_company is null or e.company_id = p_company)
      and (p_start is null or e.due_date >= p_start) and (p_end is null or e.due_date <= p_end)
    union all
    select 'Descontos'::text,
           (case when e.type='payable' then -1 else 1 end) * e.discount_amount
    from public.entries e
    where e.status <> 'cancelled' and e.invoice_account_id is null
      and e.discount_amount > 0
      and (p_company is null or e.company_id = p_company)
      and (p_start is null or e.due_date >= p_start) and (p_end is null or e.due_date <= p_end)
  ) fin
  group by fin.categoria;
$$;
grant execute on function public.dre_competencia(uuid,date,date,text) to authenticated, service_role;
