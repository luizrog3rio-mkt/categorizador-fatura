-- ============================================================================
-- Habilita pg_cron + pg_net pro auto-sync diário da Hotmart
-- ============================================================================
-- APLICADA em 2026-06-10 (version vivo 20260610202455). pg_cron 1.6.4 +
-- pg_net 0.20.0 instaladas. pg_cron: agendador no banco. pg_net: HTTP
-- assíncrono (chama a Edge Function). Read-only de dados — só liga extensões.
-- O job do cron (cron.schedule do hotmart-sync-diario) é aplicado à parte,
-- depois do segredo no Vault.
-- ============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;
