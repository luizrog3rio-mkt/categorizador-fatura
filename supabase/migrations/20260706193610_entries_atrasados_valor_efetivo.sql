-- APLICADA: 20260706193610
-- Coluna "A pagar" da tela de Lançamentos (2026-07-06) definiu a régua "valor
-- efetivo" (amount + juros + multa − desconto) pra "quanto falta pagar" — a tela
-- e o Dashboard (A pagar/A receber do mês) já usam essa régua no front. A RPC
-- entries_atrasados (KPI "Atrasados" do Dashboard, criada na 20260701110727)
-- ainda somava só amount: com desconto pré-lançado num vencido, superestimava
-- (havia 2 entries to_pay com desconto vencendo 2026-07-08/10). Mesma população
-- (to_pay/pending, sem transferência, vencidos), só a soma muda.
-- Aprovada pelo Luiz em 2026-07-06.

create or replace function public.entries_atrasados(p_company uuid default null)
 returns numeric language sql stable set search_path = ''
as $function$
  select coalesce(sum(amount + interest_amount + fine_amount - discount_amount), 0)
  from public.entries
  where status in ('to_pay','pending') and due_date < current_date
    and transfer_id is null
    and (p_company is null or company_id = p_company);
$function$;
