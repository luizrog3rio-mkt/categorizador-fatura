-- APLICADA: 20260630212201
-- Auditoria 2026-06-30 (footgun #4 do seletor de empresa): o sync/import gravam por
-- transaction_code setando company_id -> trocar a empresa + sync re-atribuia vendas entre
-- empresas. Trigger congela o company_id (definido no 1o INSERT, nao muda por re-sync/import/
-- webhook). Escape pra correcao manual deliberada: set local app.permite_trocar_empresa_hotmart=
-- 'on' (ou select set_config('app.permite_trocar_empresa_hotmart','on',true)) antes do UPDATE.
-- Cobre todos os writers de uma vez. Aprovado pelo Luiz em 2026-06-30. Verificado: sem escape o
-- update de company_id e congelado; com escape passa.
create or replace function public.congela_company_hotmart()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if current_setting('app.permite_trocar_empresa_hotmart', true) is distinct from 'on' then
    new.company_id := old.company_id;
  end if;
  return new;
end; $function$;

create trigger trg_congela_company_hotmart
  before update on public.hotmart_sales
  for each row execute function public.congela_company_hotmart();
