-- APLICADA: 20260629221738
-- Índice único: impede regra de propagação duplicada (mesmas condições + destino).
-- COALESCE trata NULL como '' para a unicidade valer mesmo com campos vazios (pré-PG15
-- NULL é distinto). Criado com 0 duplicatas. O RegraModal traduz o 23505 em "essa regra
-- já existe". Aprovada pelo Luiz em 2026-06-29 (Fase 6 — guarda-corpos).
create unique index origin_tracking_rules_unq on public.origin_tracking_rules (
  coalesce(src_value,''), src_match,
  coalesce(sck_value,''), sck_match,
  coalesce(xcode_value,''), xcode_match,
  coalesce(afiliado_value,''), afiliado_match,
  coalesce(group_id::text,''), coalesce(seller_id::text,'')
);
