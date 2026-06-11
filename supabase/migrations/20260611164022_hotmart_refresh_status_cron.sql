-- Cron diário de REFRESH DE STATUS (06:30 BRT / 09:30 UTC, depois do sync de
-- descoberta das 09:00 UTC). A busca por janela de data NÃO traz reembolso/
-- chargeback (pegadinha confirmada: a base tinha zero estornos). Este job chama
-- a hotmart-sync em modo refresh_status=200, que re-busca vendas por
-- ?transaction=<id> (que SEMPRE retorna) e atualiza estornos. Rodízio por
-- status_checked_at cobre a janela de ~6 meses em ~30 dias.
-- Lê o segredo do Vault; timeout 120s (default 5s do pg_net estoura).
--
-- APLICADA: 2026-06-11 (version 20260611164022)

select cron.schedule('hotmart-refresh-status-diario', '30 9 * * *', $$
  select net.http_post(
    url := 'https://qdnqghefwjpeiidjlzjy.supabase.co/functions/v1/hotmart-sync',
    headers := jsonb_build_object('Content-Type','application/json',
      'apikey','sb_publishable_CYnY2cJ5mgmKJ4ZhV5IFcA_7mHEQhdo',
      'x-service-auth',(select decrypted_secret from vault.decrypted_secrets where name='hotmart_service_key')),
    body := jsonb_build_object('company_id','e16aa82e-b78a-46d2-bdb1-85ce03369a4f','refresh_status',200),
    timeout_milliseconds := 120000);
$$);
