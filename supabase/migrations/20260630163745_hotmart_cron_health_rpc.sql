-- APLICADA: 20260630163745
-- Auditoria 4 trilhas (observabilidade): o "succeeded" do pg_cron so confirma o disparo do
-- net.http_post, nao o resultado da edge function (token OAuth expirado/deploy quebrado passam
-- silenciosos). Esta RPC mede o SINAL REAL: o dado que cada cron produz. Se estagnar >limite, o
-- cron efetivamente parou. Sem mexer nas edge functions. Aprovado pelo Luiz em 2026-06-30.
-- Verificado: 4 sinais retornam; anon=false, authenticated=true.
create or replace function public.hotmart_cron_health()
returns table(sinal text, ultimo timestamptz, horas numeric, estagnado boolean, detalhe text)
language sql stable security definer set search_path to '' as $function$
  with s as (
    select
      (select max(commission_checked_at) from public.hotmart_sales) as com,
      (select max(status_checked_at)     from public.hotmart_sales) as sta,
      (select max(received_at)           from public.hotmart_webhook_events) as web,
      (select count(*) from public.hotmart_webhook_events where processed_at is null and received_at < now() - interval '10 minutes') as presos
  )
  select 'Comissões (cron 09:45)', com, round(extract(epoch from now()-com)/3600,1),
    (com is null or now()-com > interval '26 hours'),
    'Preenche afiliado/líquido; avança ~400/dia. Estagnar >26h = cron parado.' from s
  union all
  select 'Estorno/status (cron 09:30)', sta, round(extract(epoch from now()-sta)/3600,1),
    (sta is null or now()-sta > interval '26 hours'),
    'Re-checa estorno; avança ~200/dia. Estagnar >26h = cron parado.' from s
  union all
  select 'Webhook (tempo real)', web, round(extract(epoch from now()-web)/3600,1),
    (web is null or now()-web > interval '48 hours'),
    'Eventos ao vivo da Hotmart. >48h sem evento = checar config no painel.' from s
  union all
  select 'Eventos de webhook presos', null::timestamptz, null::numeric, (presos > 0),
    presos || ' evento(s) não-processado(s) há >10min (drain roda 1/min; >0 = investigar).' from s;
$function$;
revoke execute on function public.hotmart_cron_health() from public;
grant  execute on function public.hotmart_cron_health() to authenticated;
