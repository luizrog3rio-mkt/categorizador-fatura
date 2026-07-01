-- APLICADA: 20260701110727
-- Auditoria de 11 frentes, Onda 3 (itens latentes, feitos a pedido do Luiz):
-- P10: o KPI "Atrasados" do Dashboard reusava a janela -5..+2 meses do fluxo -> vencido ha >5 meses
--   nao aparecia. RPC server-side (agrega no banco, sem piso de data, sem teto de 1000): soma os
--   entries abertos (to_pay/pending) com due_date < hoje. Exclui transferencia (sempre paid, mas
--   explicito). security invoker (so le entries, RLS do caller cobre) -> sem WARN de definer.
-- valor_pendente: reconciliation_summary somava amount COM SINAL (bank_transactions.amount preserva
--   sinal) -> numa conta com debitos e creditos pendentes o "Valor pendente" virava o net (~R$0).
--   Troca por sum(abs(amount)) = magnitude a conciliar (bate com o rotulo "Valor pendente").

create or replace function public.entries_atrasados(p_company uuid default null)
 returns numeric language sql stable set search_path = ''
as $function$
  select coalesce(sum(amount), 0)
  from public.entries
  where status in ('to_pay','pending') and due_date < current_date
    and transfer_id is null
    and (p_company is null or company_id = p_company);
$function$;
grant execute on function public.entries_atrasados(uuid) to authenticated;

create or replace function public.reconciliation_summary(p_account uuid)
 returns table(total bigint, conciliadas bigint, pendentes bigint, valor_pendente numeric)
 language sql stable set search_path to ''
as $function$
  select count(*), count(*) filter (where entry_id is not null), count(*) filter (where entry_id is null),
         coalesce(sum(abs(amount)) filter (where entry_id is null),0)
  from public.bank_transactions where account_id = p_account;
$function$;
