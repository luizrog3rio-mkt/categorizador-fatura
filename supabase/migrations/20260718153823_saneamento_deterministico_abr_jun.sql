-- saneamento_deterministico_abr_jun
-- ============================================================================================
-- STATUS: ✅ APLICADA em 18/07/2026 via MCP, após revisão e aprovação explícita do Luiz.
-- Versão real retornada por list_migrations: 20260718153823.
-- Validação pós-apply: 19/19 entries nos destinos, cartão em 6.3.13 e 19 eventos no
-- entry_audit_log. O efeito na DRE abr–jun coincidiu integralmente com o snapshot previsto.
--
-- Escopo fechado e auditável:
--   • 8 entries que evaporavam da DRE por estarem como payable em conta de receita;
--   • 1 lançamento de cartão de R$3,20 que estava em dedução incompatível com o braço da DRE;
--   • 11 entries que estavam sem conta, com destino factual (tarifa, encargos, contabilidade e CSLL).
--
-- Impacto esperado abr–jun/2026:
--   • Digital: R$41.043,82 passam a aparecer como despesa/custo; lucro cai no mesmo valor;
--   • Incorporadora + Participações: R$9.010,07 saem de NC-2 para contas nominadas;
--     o lucro NÃO muda, pois NC-2 já era contabilizado como despesa.
--
-- Fora deste lote, deliberadamente: faturas/despesas pessoais, 53 custos de obra explícitos
-- (capitalização em estoque muda o resultado) e 7 itens de obra sem destino inequívoco.
-- A migration é atômica: qualquer divergência de quantidade, soma, conta anterior ou período
-- fechado aborta tudo. Os UPDATEs de entries ficam registrados pelo entry_audit_log.
-- ============================================================================================

do $migration$
declare
  v_qtd             integer;
  v_qtd_estado_ok   integer;
  v_valor           numeric;
  v_atualizados     integer;
  v_cartao_qtd      integer;
  v_cartao_valor    numeric;
begin
  -- Mapa imutável da proposta. expected_old_code NULL significa que a entry deve continuar sem
  -- conta no instante do apply; se alguém já a corrigiu, a migration aborta em vez de sobrescrever.
  with mapa(entry_id, expected_old_code, target_code) as (values
    ('747e1f8d-578b-4376-8c74-8f95f476e5e0'::uuid, '1.1.02'::text, '4.2.03'::text),
    ('8c01b194-52af-442e-86de-d9b8ff167351'::uuid, '1.1.02',       '4.2.03'),
    ('ba808f7f-8e5e-4bf7-a220-6b2c1958ba10'::uuid, '1.1.02',       '4.2.03'),
    ('9a232958-2518-4fa7-b0e6-4614ad4201f8'::uuid, '1.1.02',       '4.2.03'),
    ('3c8c4eb2-10b1-4941-b7a2-1281f3a92687'::uuid, '1.1.04',       '6.1.05'),
    ('476b2564-1112-4286-a5cd-f181475f8eae'::uuid, '1.1.03',       '4.2.03'),
    ('8bda3d8c-a644-464a-9e0f-c5b252660335'::uuid, '1.1.03',       '4.2.03'),
    ('5f4e3330-015d-46db-8dcb-5d5ca40bed40'::uuid, '1.1.03',       '4.2.03'),
    ('c40f5ead-4296-4cd1-8725-1ca4df221e80'::uuid, null,            '8.2'),
    ('7354d888-1388-4880-a2a7-55a60ede3177'::uuid, null,            '8.2'),
    ('3d75799a-f3ef-4cda-b19c-d66f7bffd0da'::uuid, null,            '6.1.02'),
    ('77fdfd73-5a3f-453f-a04a-642b505fa948'::uuid, null,            '6.1.02'),
    ('3256814a-faf2-413d-8147-bda735db4971'::uuid, null,            '6.1.02'),
    ('409fc81e-8a99-4f12-8238-ca11fc12d4f5'::uuid, null,            '6.1.02'),
    ('8fd9a271-9d08-4b9d-ba49-c362e0fd7466'::uuid, null,            '6.3.03'),
    ('c1e1d00d-8a78-4dfb-a244-65fe47a4a975'::uuid, null,            '11'),
    ('2f6df69a-3c04-46e6-83bb-93f540f8bc1c'::uuid, null,            '6.1.02'),
    ('326cab51-416a-4cff-be7c-a5f0e63067cb'::uuid, null,            '6.1.02'),
    ('0940830b-0116-4696-98f1-d2436738631d'::uuid, null,            '8.2')
  )
  select count(*),
         count(*) filter (where
           (m.expected_old_code is null and e.chart_of_account_id is null)
           or old_coa.code = m.expected_old_code
         ),
         coalesce(sum(e.amount), 0)
    into v_qtd, v_qtd_estado_ok, v_valor
  from mapa m
  join public.entries e on e.id = m.entry_id
  left join public.chart_of_accounts old_coa on old_coa.id = e.chart_of_account_id;

  if v_qtd <> 19 or v_qtd_estado_ok <> 19 or v_valor <> 50050.69 then
    raise exception 'Precondição entries divergiu: qtd %, estado_ok %, valor % (esperado 19/19/50050.69)',
      v_qtd, v_qtd_estado_ok, v_valor;
  end if;

  if (select count(*) from public.closed_periods where period in ('2026-04','2026-05','2026-06')) > 0 then
    raise exception 'Há período fechado entre 2026-04 e 2026-06; saneamento abortado';
  end if;

  with mapa(entry_id, target_code) as (values
    ('747e1f8d-578b-4376-8c74-8f95f476e5e0'::uuid, '4.2.03'::text),
    ('8c01b194-52af-442e-86de-d9b8ff167351'::uuid, '4.2.03'),
    ('ba808f7f-8e5e-4bf7-a220-6b2c1958ba10'::uuid, '4.2.03'),
    ('9a232958-2518-4fa7-b0e6-4614ad4201f8'::uuid, '4.2.03'),
    ('3c8c4eb2-10b1-4941-b7a2-1281f3a92687'::uuid, '6.1.05'),
    ('476b2564-1112-4286-a5cd-f181475f8eae'::uuid, '4.2.03'),
    ('8bda3d8c-a644-464a-9e0f-c5b252660335'::uuid, '4.2.03'),
    ('5f4e3330-015d-46db-8dcb-5d5ca40bed40'::uuid, '4.2.03'),
    ('c40f5ead-4296-4cd1-8725-1ca4df221e80'::uuid, '8.2'),
    ('7354d888-1388-4880-a2a7-55a60ede3177'::uuid, '8.2'),
    ('3d75799a-f3ef-4cda-b19c-d66f7bffd0da'::uuid, '6.1.02'),
    ('77fdfd73-5a3f-453f-a04a-642b505fa948'::uuid, '6.1.02'),
    ('3256814a-faf2-413d-8147-bda735db4971'::uuid, '6.1.02'),
    ('409fc81e-8a99-4f12-8238-ca11fc12d4f5'::uuid, '6.1.02'),
    ('8fd9a271-9d08-4b9d-ba49-c362e0fd7466'::uuid, '6.3.03'),
    ('c1e1d00d-8a78-4dfb-a244-65fe47a4a975'::uuid, '11'),
    ('2f6df69a-3c04-46e6-83bb-93f540f8bc1c'::uuid, '6.1.02'),
    ('326cab51-416a-4cff-be7c-a5f0e63067cb'::uuid, '6.1.02'),
    ('0940830b-0116-4696-98f1-d2436738631d'::uuid, '8.2')
  ), destinos as (
    select m.entry_id, coa.id as target_id
    from mapa m
    join public.chart_of_accounts coa
      on coa.code = m.target_code
     and coa.tipo = 'resultado'
     and coa.company_id is null
     and coa.active = true
     and coa.is_analytical = true
  )
  update public.entries e
     set chart_of_account_id = d.target_id
    from destinos d
   where e.id = d.entry_id;

  get diagnostics v_atualizados = row_count;
  if v_atualizados <> 19 then
    raise exception 'UPDATE entries atingiu % linhas; esperado 19', v_atualizados;
  end if;

  select count(*), coalesce(sum(t.amount),0)
    into v_cartao_qtd, v_cartao_valor
  from public.transactions t
  join public.chart_of_accounts coa on coa.id = t.chart_of_account_id
  where t.id = '91c461b3-782d-428d-8b23-1b0e4ebe33cf'::uuid
    and coa.code = '2.3.01';

  if v_cartao_qtd <> 1 or v_cartao_valor <> 3.20 then
    raise exception 'Precondição cartão divergiu: qtd %, valor % (esperado 1/3.20)',
      v_cartao_qtd, v_cartao_valor;
  end if;

  update public.transactions t
     set chart_of_account_id = coa.id
    from public.chart_of_accounts coa
   where t.id = '91c461b3-782d-428d-8b23-1b0e4ebe33cf'::uuid
     and coa.code = '6.3.13'
     and coa.tipo = 'resultado'
     and coa.company_id is null
     and coa.active = true
     and coa.is_analytical = true;

  get diagnostics v_atualizados = row_count;
  if v_atualizados <> 1 then
    raise exception 'UPDATE cartão atingiu % linhas; esperado 1', v_atualizados;
  end if;

  raise notice 'Saneamento concluído: 19 entries (R$50.050,69) + 1 cartão (R$3,20)';
end;
$migration$;
