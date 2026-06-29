-- ============================================================================
-- Remove o modelo de origem v1 (de-paras + RPCs órfãs) — Fase 2b
-- ----------------------------------------------------------------------------
-- O modelo v1 (hotmart_origin_map / hotmart_sck_map / hotmart_affiliate_map +
-- RPCs) foi substituído pelo modelo de canais v2 (origem_canais_v2). Os dados já
-- foram migrados e nenhuma tela em src/ referencia mais esses objetos (verificado).
--
-- MANTIDOS (em uso pela v2 e pela /hotmart): hotmart_canal_base, hotmart_origin_suggest,
-- hotmart_by_affiliate, hotmart_totals e a view hotmart_sales_origin.
--
-- A limpeza dos DADOS do modelo v2 (zerar origin_channels/tracking_map/override pro
-- Luiz remapear do zero) é feita à parte (DML operacional), fora desta migration.
--
-- APLICADA: 2026-06-29 (version 20260629142205)
-- ============================================================================

drop function if exists public.hotmart_channels(text);
drop function if exists public.hotmart_scks(text);
drop function if exists public.hotmart_affiliates(text);
drop function if exists public.hotmart_by_origin(uuid, date, date, text);
drop function if exists public.hotmart_by_seller(uuid, date, date, text);
drop function if exists public.hotmart_by_person(uuid, date, date, text);

drop table if exists public.hotmart_origin_map;
drop table if exists public.hotmart_sck_map;
drop table if exists public.hotmart_affiliate_map;
