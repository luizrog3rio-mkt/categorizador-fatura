-- ============================================================================
-- Relatório de categorias — RPC relatorio_categorias (motor de agregação)
-- ============================================================================
-- APLICADA em 2026-06-22 via MCP apply_migration — version vivo 20260622170139
-- (renomeado do placeholder 20260622000003). Pós-apply validado: consolida cartão
-- + lançamentos por categoria (ex.: Imposto = 1.465,57 cartão + 188.588,54 entries
-- = 190.054,11) e os números do cartão batem com o banco (Tráfego 380.438,51 etc.).
--
-- Passo 2/4 do bloco financeiro. RPC única que soma valor por categoria num
-- período, atravessando a assimetria categoria-TEXTO (cartão: transactions.category)
-- vs categoria-FK (entries/bank_transactions.category_id). É o "motor" que a DRE
-- (passo 3) vai reusar. Tudo agrega no BANCO (PostgREST corta em 1000 e
-- transactions já tem 1112 linhas).
--
-- Correções dos críticos embutidas:
--   - ANTI-FAN-OUT: junta contra `cats` (categorias DEDUPLICADAS por lower(btrim(name)))
--     porque categories.name NÃO é unique team-wide -> um 2º usuário com nome
--     homônimo dobraria as somas no join por nome.
--   - ANTI-DUPLA-CONTAGEM: exclui o lançamento de fatura (entries.invoice_account_id
--     not null) e conta do extrato só o NÃO conciliado (bank_transactions.entry_id
--     IS NULL — dedup via o hook de conciliação da Fase 1c).
--   - BLINDAGEM to_date: regex no transactions.date (texto DD/MM/YYYY) antes de
--     converter, pra um import futuro torto não derrubar a RPC inteira.
--   - 3 SINAIS normalizados: cartão (kind, valorComSinal), entries (type),
--     bank_transactions (amount já com sinal).
--
-- Decisões (Luiz, 2026-06-22): escopo consolidado (cartão+entries+extrato) com
-- toggles; regime default = competência (caixa só afeta entries); cartão SEMPRE
-- visível mesmo filtrando empresa (transactions não tem company_id — mesmo
-- comportamento do Dashboard, alinhado com a DRE). Hotmart e Compras (purchase_items,
-- vocabulário separado) ficam FORA por design.
--
-- Hardening = espelha hotmart_totals: sql STABLE, SECURITY INVOKER (RLS de equipe),
-- search_path='', GRANT a authenticated+service_role.
-- ============================================================================

create or replace function public.relatorio_categorias(
  p_start date default null, p_end date default null, p_company uuid default null,
  p_regime text default 'competencia',
  p_inc_cartao boolean default true, p_inc_entries boolean default true, p_inc_extrato boolean default true
) returns table (
  categoria text, color_index int,
  despesa_cartao numeric, despesa_entries numeric, receita_entries numeric,
  despesa_extrato numeric, receita_extrato numeric,
  despesa_total numeric, receita_total numeric, saldo numeric, n_lanc bigint
) language sql stable security invoker set search_path = '' as $$
  with cats as ( -- dedup por nome (categories.name nao e unique team-wide -> evita fan-out)
    select distinct on (lower(btrim(name))) lower(btrim(name)) as chave, name, color_index
    from public.categories order by lower(btrim(name)), created_at
  ),
  linhas as (
    -- CARTAO: texto -> nome canonico; sinal por kind; sempre visivel (transactions nao tem company_id)
    select coalesce(cc.name, nullif(btrim(t.category),''), 'Sem categoria') as categoria,
           case when t.kind='credit' then -t.amount else t.amount end as despesa_cartao,
           0::numeric as despesa_entries, 0::numeric as receita_entries,
           0::numeric as despesa_extrato, 0::numeric as receita_extrato
    from public.transactions t
    left join cats cc on cc.chave = lower(btrim(t.category))
    where p_inc_cartao
      and t.date ~ '^[0-3][0-9]/[0-1][0-9]/[0-9]{4}$'
      and (p_start is null or to_date(t.date,'DD/MM/YYYY') >= p_start)
      and (p_end   is null or to_date(t.date,'DD/MM/YYYY') <= p_end)
    union all
    -- ENTRIES: FK; sinal por type; exclui cancelled e o lancamento de fatura; regime
    select coalesce(c.name,'Sem categoria'), 0,
           case when e.type='payable'    then e.amount else 0 end,
           case when e.type='receivable' then e.amount else 0 end, 0, 0
    from public.entries e left join public.categories c on c.id = e.category_id
    where p_inc_entries and e.status <> 'cancelled' and e.invoice_account_id is null
      and (p_company is null or e.company_id = p_company)
      and ( (p_regime='competencia' and (p_start is null or e.due_date >= p_start) and (p_end is null or e.due_date <= p_end))
            or (p_regime='caixa' and e.status='paid' and e.payment_date is not null
                and (p_start is null or e.payment_date >= p_start) and (p_end is null or e.payment_date <= p_end)) )
    union all
    -- EXTRATO: FK; amount ja com sinal; so o NAO conciliado (dedup via o hook entry_id)
    select coalesce(c.name,'Sem categoria'), 0,0,0,
           case when b.amount < 0 then -b.amount else 0 end,
           case when b.amount > 0 then  b.amount else 0 end
    from public.bank_transactions b
    left join public.categories c on c.id = b.category_id
    left join public.accounts a on a.id = b.account_id
    where p_inc_extrato and b.entry_id is null
      and (p_start is null or b.date >= p_start) and (p_end is null or b.date <= p_end)
      and (p_company is null or a.company_id = p_company)
  )
  select l.categoria, coalesce(max(cats.color_index),0),
         sum(l.despesa_cartao), sum(l.despesa_entries), sum(l.receita_entries),
         sum(l.despesa_extrato), sum(l.receita_extrato),
         sum(l.despesa_cartao + l.despesa_entries + l.despesa_extrato),
         sum(l.receita_entries + l.receita_extrato),
         sum(l.receita_entries + l.receita_extrato) - sum(l.despesa_cartao + l.despesa_entries + l.despesa_extrato),
         count(*)
  from linhas l left join cats on cats.chave = lower(btrim(l.categoria))
  group by l.categoria order by 8 desc;
$$;
grant execute on function public.relatorio_categorias(date,date,uuid,text,boolean,boolean,boolean) to authenticated, service_role;
