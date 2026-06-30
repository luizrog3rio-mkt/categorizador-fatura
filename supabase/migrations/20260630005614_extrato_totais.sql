-- APLICADA: 20260630005614
-- RPC extrato_totais(p_account): Entradas/Saídas/Saldo/qtd de UMA conta, agregados
-- no banco. Motivo: o Extrato lista só 300 linhas no cliente e o PostgREST corta em
-- 1000 — somar no front daria total errado. security invoker (roda com a RLS de
-- equipe, que já libera bank_transactions pra authenticated; sem escalar privilégio).
-- Aprovada pelo Luiz em 2026-06-30 (médias da auditoria de design — KPIs do Extrato).
create or replace function public.extrato_totais(p_account uuid)
returns table (entradas numeric, saidas numeric, saldo numeric, qtd bigint)
language sql
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(amount) filter (where amount > 0), 0) as entradas,
    coalesce(sum(amount) filter (where amount < 0), 0) as saidas,
    coalesce(sum(amount), 0)                           as saldo,
    count(*)                                            as qtd
  from public.bank_transactions
  where account_id = p_account;
$$;

grant execute on function public.extrato_totais(uuid) to authenticated;
