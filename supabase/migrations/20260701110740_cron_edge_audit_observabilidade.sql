-- APLICADA: 20260701110740
-- Auditoria de 11 frentes, Onda 3 P9 (feito a pedido do Luiz): "succeeded" do pg_cron so diz que o
-- net.http_post ENFILEIROU — o status HTTP real da edge vive em net._http_response, purgado pelo
-- pg_net em ~6h. Se um cron Hotmart passar a falhar (5xx/timeout/JWT/secret do Vault), a evidencia
-- some sem rastro. Fix: persistir o status antes da purga. Como SO os 3 crons Hotmart usam
-- net.http_post (o webhook-drain e SQL puro), toda linha de net._http_response e uma resposta de edge
-- nossa. postgres le net._http_response (verificado). Snapshot horario (folgado dentro dos ~6h).

create table public.cron_edge_audit (
  id               bigint generated always as identity primary key,
  response_id      bigint unique not null,      -- net._http_response.id (dedupe)
  status_code      int,
  timed_out        boolean,
  error_msg        text,
  content_snippet  text,                         -- inicio do corpo (diagnostico)
  responded_at     timestamptz,                  -- net._http_response.created (quando a edge respondeu)
  observed_at      timestamptz not null default now()
);
alter table public.cron_edge_audit enable row level security;
grant select on public.cron_edge_audit to authenticated;   -- equipe LE (default privileges foram revogados; sem grant de escrita)
create policy "team le cron_edge_audit" on public.cron_edge_audit for select to authenticated using (true);

-- copia as respostas novas de net._http_response pro audit durável (dedupe por response_id).
-- SECURITY DEFINER (owner postgres, que le net._http_response); search_path='' -> net qualificado.
create or replace function public.snapshot_cron_edge_responses()
 returns integer language plpgsql security definer set search_path = ''
as $function$
declare n int;
begin
  insert into public.cron_edge_audit (response_id, status_code, timed_out, error_msg, content_snippet, responded_at)
  select r.id, r.status_code, r.timed_out, r.error_msg, left(r.content, 300), r.created
  from net._http_response r
  where not exists (select 1 from public.cron_edge_audit a where a.response_id = r.id);
  get diagnostics n = row_count;
  return n;
end $function$;
revoke execute on function public.snapshot_cron_edge_responses() from public;  -- so o cron (postgres) chama

-- snapshot inicial (captura as respostas que ja estao na janela) + cron horario
select public.snapshot_cron_edge_responses();
select cron.schedule('snapshot-edge-responses', '0 * * * *', $$select public.snapshot_cron_edge_responses();$$);
