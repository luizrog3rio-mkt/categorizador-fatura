-- ============================================================================
-- Cron diário de preenchimento de COMISSÕES (afiliado/coprodução/líquido exato)
-- ----------------------------------------------------------------------------
-- Roda 06:45 BRT / 09:45 UTC, DEPOIS do sync de descoberta (09:00) e do refresh
-- de status (09:30) — o refresh_commissions re-checa a janela recente (~35d) que
-- o sync diário regrava por cima, então precisa vir por último. Chama a
-- hotmart-sync em modo refresh_commissions=400 (consulta /sales/commissions 1 a 1
-- por ?transaction=<id>). Rodízio por commission_checked_at (NULLS FIRST cobre o
-- backfill; depois cicla a janela recente). Lê o segredo do Vault; timeout 120s.
--
-- O backfill inicial (~14,9k vendas) foi tocado à parte por um cron temporário
-- 'hotmart-commissions-backfill' (*/2), removido ao zerar — não versionado aqui.
--
-- APLICADA: 2026-06-25 (version 20260625211436)
-- ============================================================================

select cron.schedule('hotmart-commissions-diario', '45 9 * * *', $$
  select net.http_post(
    url := 'https://qdnqghefwjpeiidjlzjy.supabase.co/functions/v1/hotmart-sync',
    headers := jsonb_build_object('Content-Type','application/json',
      'apikey','sb_publishable_CYnY2cJ5mgmKJ4ZhV5IFcA_7mHEQhdo',
      'x-service-auth',(select decrypted_secret from vault.decrypted_secrets where name='hotmart_service_key')),
    body := jsonb_build_object('company_id','e16aa82e-b78a-46d2-bdb1-85ce03369a4f','refresh_commissions',400),
    timeout_milliseconds := 120000);
$$);
