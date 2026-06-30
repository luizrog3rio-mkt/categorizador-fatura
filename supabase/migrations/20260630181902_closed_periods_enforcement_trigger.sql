-- APLICADA: 20260630181902
-- Auditoria resiliencia 2026-06-30: a trava de periodo fechado (closed_periods) so era checada
-- no save manual do frontend; transferencias/lote/API/migrations escapavam (com RLS using(true)
-- qualquer membro alterava um mes encerrado). Trigger enforça no banco: rejeita INSERT/UPDATE/
-- DELETE em entries cujo mes de competencia (coalesce competency/issue/due, mesma logica do
-- frontend) esta fechado pra empresa. Aprovado pelo Luiz em 2026-06-30. (0 periodos fechados hoje
-- -> inerte ate alguem fechar um.) Verificado: insert num periodo fechado de teste foi bloqueado.
create or replace function public.bloqueia_periodo_fechado()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare cid uuid; d date; mes text;
begin
  if tg_op='DELETE' then d := coalesce(old.competency_date, old.issue_date, old.due_date); cid := old.company_id;
  else                    d := coalesce(new.competency_date, new.issue_date, new.due_date); cid := new.company_id; end if;
  if exists (select 1 from public.closed_periods cp where cp.company_id=cid and cp.period=to_char(d,'YYYY-MM')) then
    raise exception 'Periodo % esta fechado para esta empresa. Reabra antes de alterar lancamentos.', to_char(d,'YYYY-MM')
      using errcode='check_violation';
  end if;
  if tg_op='UPDATE' then
    mes := to_char(coalesce(old.competency_date, old.issue_date, old.due_date),'YYYY-MM');
    if exists (select 1 from public.closed_periods cp where cp.company_id=old.company_id and cp.period=mes) then
      raise exception 'Periodo % esta fechado (origem do lancamento). Reabra antes de alterar.', mes using errcode='check_violation';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $function$;

create trigger trg_bloqueia_periodo_fechado
  before insert or update or delete on public.entries
  for each row execute function public.bloqueia_periodo_fechado();
