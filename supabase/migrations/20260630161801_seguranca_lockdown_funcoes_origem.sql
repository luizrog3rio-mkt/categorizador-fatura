-- APLICADA: 20260630161801
-- Corrige regressao das migrations de hoje: funcoes novas/recriadas nasceram com EXECUTE pra
-- PUBLIC (anon) -- o default do Postgres; o revoke de default-privileges da Fase 1a nao pega em
-- funcao criada via migration. Isso reabria o que a auditoria de seguranca havia fechado.
-- apply_origin_rules_one e trg_classify_new_sale sao INTERNAS (so o trigger as chama) -> revoga de
-- TODOS (o trigger roda como owner, nao depende do grant). origin_unmapped_values/by_group/
-- seller_report sao do frontend -> tira anon, mantem authenticated. Aprovado pelo Luiz 2026-06-30.
-- Verificado: anon nao executa nenhuma das 5; authenticated mantem as 3 do frontend; o trigger
-- ainda dispara (teste transacional classificou pro grupo certo); /hotmart carrega sem erro.
revoke execute on function public.apply_origin_rules_one(text)             from public;
revoke execute on function public.trg_classify_new_sale()                  from public;
revoke execute on function public.origin_unmapped_values(text, uuid, text) from public;
revoke execute on function public.hotmart_by_group(uuid, date, date, text) from public;
revoke execute on function public.hotmart_seller_report(uuid, date, date, text) from public;
grant execute on function public.origin_unmapped_values(text, uuid, text) to authenticated;
grant execute on function public.hotmart_by_group(uuid, date, date, text) to authenticated;
grant execute on function public.hotmart_seller_report(uuid, date, date, text) to authenticated;
