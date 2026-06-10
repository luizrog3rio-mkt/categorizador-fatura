-- ============================================================================
-- Cron diário do auto-sync da Hotmart (pg_cron + pg_net)
-- ============================================================================
-- APLICADA em 2026-06-10. Roda 1×/dia (06:00 BRT / 09:00 UTC), chama a Edge
-- Function hotmart-sync em modo-serviço: o x-service-auth vem do Vault
-- (hotmart_service_key) — o segredo NÃO fica embutido aqui. Janela de 1 mês
-- (vendas novas + atualiza status de reembolso/chargeback). Idempotente (upsert
-- por transaction_code). timeout 60s (default do pg_net é curto). Testado via
-- net.http_post manual: 200 / gravadas 391.
-- ============================================================================

select cron.schedule(
  'hotmart-sync-diario',
  '0 9 * * *',
  $cron$
  select net.http_post(
    url := 'https://qdnqghefwjpeiidjlzjy.supabase.co/functions/v1/hotmart-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_CYnY2cJ5mgmKJ4ZhV5IFcA_7mHEQhdo',
      'x-service-auth', (select decrypted_secret from vault.decrypted_secrets where name = 'hotmart_service_key')
    ),
    body := jsonb_build_object('company_id', 'e16aa82e-b78a-46d2-bdb1-85ce03369a4f', 'months', 1),
    timeout_milliseconds := 60000
  );
  $cron$
);
