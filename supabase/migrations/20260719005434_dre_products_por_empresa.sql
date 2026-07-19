-- Migration: dre_products_por_empresa
-- STATUS: APLICADA em 2026-07-19, version 20260719005434 (SQL revisado e aprovado pelo Luiz;
-- dry-run com rollback passou antes; smoke pós-apply: 12/12 produtos em RB7 DIGITAL, 0 nulos).
--
-- Decisão do Luiz (2026-07-19): Produtos DRE ficava igual em toda empresa ao trocar o
-- seletor global — a taxonomia `dre_products` nunca teve `company_id` (sempre null,
-- tratada como "global/compartilhada" desde a criação, migration 20260624115030). Auditoria
-- confirmou que os 12 produtos vivos são 100% RB7 DIGITAL: toda referência real —
-- entries.dre_product_id (13), chart_of_accounts.dre_product_id (4) e
-- hotmart_product_map.dre_product_id (65) — aponta pra RB7 DIGITAL, nenhuma outra empresa
-- usa produto (Incorporadora usa "obras", Participações/Molho/Conta Pessoal não têm
-- conceito de produto). Isso revoga o comentário "taxonomia GLOBAL" do front (já reescrito).
--
-- O que esta migration faz (só DML, sem DDL — a coluna já existe e é nullable):
--   1. Backfill: os 12 dre_products com company_id null passam a ter company_id = RB7 DIGITAL.
--   2. Nenhuma outra tabela é tocada — entries/chart_of_accounts/hotmart_product_map já
--      apontam pra RB7 DIGITAL via company_id próprio; o produto só passa a "pertencer"
--      formalmente à mesma empresa que já era a única usuária de fato.
--
-- Front (já no repo, redeploy junto): tela /produtos-dre exige empresa pra criar produto
-- novo e mostra badge de empresa; seletor "Produto DRE" do Plano de Contas e a DRE por
-- Produto filtram pela empresa do registro; mapeamento Hotmart usa só produtos da Digital.
-- `company_id null` segue tratado como "legado/todas" nesses filtros — nenhuma tela quebra
-- se esta migration demorar a ser aplicada.
--
-- Invariantes verificadas (abortam o apply se falharem):
--   • exatamente 12 dre_products com company_id null antes do backfill;
--   • 100% deles referenciados só por RB7 DIGITAL em entries e chart_of_accounts (as 2
--     tabelas que têm company_id próprio pra comparar; hotmart_product_map não tem — mas
--     Hotmart é 100% RB7 DIGITAL por trigger, então não há o que checar ali);
--   • depois do backfill, zero dre_products com company_id null.

do $$
declare
  c_dig constant uuid := 'e16aa82e-b78a-46d2-bdb1-85ce03369a4f'; -- RB7 DIGITAL
  v_n bigint;
begin
  if (select count(*) from public.companies co where co.id = c_dig and co.name = 'RB7 DIGITAL') <> 1 then
    raise exception 'ID da RB7 DIGITAL nao bate com o esperado';
  end if;

  select count(*) into v_n from public.dre_products where company_id is null;
  if v_n <> 12 then
    raise exception 'Esperava 12 dre_products com company_id null, achei %', v_n;
  end if;

  -- nenhuma referência real fora da Digital (guarda contra uso que a auditoria não viu)
  select count(*) into v_n from public.entries e
  join public.dre_products dp on dp.id = e.dre_product_id
  where dp.company_id is null and e.company_id <> c_dig;
  if v_n <> 0 then raise exception '% entries de outra empresa referenciam produto DRE global', v_n; end if;

  select count(*) into v_n from public.chart_of_accounts ca
  join public.dre_products dp on dp.id = ca.dre_product_id
  where dp.company_id is null and ca.company_id <> c_dig;
  if v_n <> 0 then raise exception '% chart_of_accounts de outra empresa referenciam produto DRE global', v_n; end if;

  update public.dre_products set company_id = c_dig where company_id is null;
  get diagnostics v_n = row_count;
  if v_n <> 12 then raise exception 'Backfill deveria afetar 12 linhas, afetou %', v_n; end if;

  if exists (select 1 from public.dre_products where company_id is null) then
    raise exception 'Pos: sobrou dre_products com company_id null';
  end if;

  raise notice 'Backfill de dre_products concluido: % produtos agora sao da RB7 DIGITAL', v_n;
end;
$$;
