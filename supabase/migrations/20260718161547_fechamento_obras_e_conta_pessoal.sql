-- fechamento_obras_e_conta_pessoal
-- ============================================================================================
-- STATUS: APLICADA em 18/07/2026 via MCP, apos revisao e duas aprovacoes explicitas do Luiz.
-- Versao real retornada por list_migrations: 20260718161547.
-- A primeira tentativa abortou atomicamente ao detectar 6 lancamentos ja classificados fora
-- do escopo; o filtro foi corrigido para exigir chart_of_account_id e obra_id nulos, reaprovado
-- e aplicado. Smoke: NC-2 zerado nas duas empresas, 58 obras/R$134.172,06, 5 parcelas da
-- betoneira/R$5.031,63, 27 pessoais/R$99.830,71, 10 partidas de obra e 0 desbalanceadas.
--
-- OBJETIVO: zerar o saldo "a classificar" de abril a junho/2026 sem inventar contas de
-- pagamento. O lote transforma custos de construcao em estoque, a betoneira em imobilizado e
-- movimentos da conta pessoal em contas patrimoniais. A DRE deixa de tratar aquisicoes de ativo
-- e gastos pessoais como custo operacional.
--
-- DECISOES APLICADAS NESTE LOTE:
--   1. 58 custos de obra (R$ 134.172,06) -> 1.2 Estoque de obras em andamento:
--      Alfenas 34 / R$ 56.676,31; Cristais 24 / R$ 77.495,75.
--      As 53 descricoes explicitas seguem o nome da obra. Evidencias para os 5 inferidos:
--      SANECAMP e Paraiba Ferragens -> Cristais (historico explicito); Leal Gesso -> Alfenas
--      (historico posterior explicito); Madeireira do Zetinho e G4 Construcoes -> Cristais
--      (materiais estruturais na fase em que Cristais estava em estrutura e Alfenas em acabamento).
--   2. Cinco parcelas da betoneira (R$ 5.031,63) -> 1.4.01 Maquinas e equipamentos.
--      A partida ja existente da parcela 3/5 e reclassificada de 8.2 para o imobilizado.
--   3. Conta pessoal: 3 consorcios / R$ 5.230,00 -> ativo; outros 24 / R$ 94.600,71 ->
--      3.1 Movimentacoes pessoais do titular (redutora do PL). O valor integral dos consorcios
--      fica no ativo por falta do demonstrativo que separa fundo comum de taxa/seguro.
--
-- IMPACTO PREVISTO NA DRE ABR-JUN/2026:
--   Incorporadora: +R$ 136.181,10 no resultado; Conta Pessoal: +R$ 99.830,71;
--   Consolidado: +R$ 236.011,81. O balde NC-2 do periodo cai de 87 itens para zero.
--   Em julho, as parcelas 3/5 a 5/5 da betoneira retiram mais R$ 3.022,59 da DRE.
--
-- PARTIDAS DOBRADAS:
--   Somente os 5 custos de obra que ja informam conta pagadora recebem D estoque / C caixa.
--   Os demais continuam sem partidas ate a conta pagadora ser informada. Nao se usa conta de
--   compensacao nem partes relacionadas como palpite. A partida existente da betoneira 3/5 e
--   corrigida; parcelas sem conta/pagamento continuam sem partida.
--
-- SEGURANCA: migration atomica, com precondicoes de quantidade, valor, estado anterior, contas,
-- obras e periodos abertos. Qualquer divergencia aborta tudo.
-- ============================================================================================

do $migration$
declare
  v_incorporadora_id uuid;
  v_pessoal_id uuid;
  v_estoque_id uuid;
  v_imobilizado_id uuid;
  v_consorcio_id uuid;
  v_pessoal_mov_id uuid;
  v_alfenas_id uuid;
  v_cristais_id uuid;
  v_qtd integer;
  v_estado_ok integer;
  v_valor numeric;
  v_alterados integer;
begin
  select id into strict v_incorporadora_id
  from public.companies where name = 'RB7 INCORPORADORA';

  select id into strict v_pessoal_id
  from public.companies where name = 'RAFAEL BRITO - CONTA PESSOAL';

  select id into strict v_alfenas_id
  from public.obras where company_id = v_incorporadora_id and nome = 'Alfenas';

  select id into strict v_cristais_id
  from public.obras where company_id = v_incorporadora_id and nome = 'Cristais';

  if exists (
    select 1 from public.closed_periods
    where period in ('2026-04','2026-05','2026-06','2026-07')
  ) then
    raise exception 'Ha periodo fechado entre 2026-04 e 2026-07; lote abortado';
  end if;

  -- A conta de estoque ja existe; as demais contas desta migration ainda nao podem existir.
  select id into strict v_estoque_id
  from public.chart_of_accounts
  where company_id = v_incorporadora_id and tipo = 'patrimonial' and code = '1.2'
    and nature = 'asset' and active = true and is_analytical = true;

  if exists (
    select 1 from public.chart_of_accounts
    where (company_id = v_incorporadora_id and tipo = 'patrimonial' and code in ('1.4','1.4.01'))
       or (company_id = v_pessoal_id and tipo = 'patrimonial' and code in ('1','1.1','3','3.1'))
  ) then
    raise exception 'Uma conta patrimonial que a migration criaria ja existe; lote abortado';
  end if;

  -- 58 custos de obra: 53 com obra explicita na descricao + 5 inferidos por evidencia historica.
  with alvos as (
    select e.id, e.amount, e.chart_of_account_id, e.obra_id
    from public.entries e
    where e.company_id = v_incorporadora_id
      and coalesce(e.competency_date,e.issue_date,e.due_date)
          between date '2026-04-01' and date '2026-06-30'
      and e.transfer_id is null
      and e.chart_of_account_id is null
      and e.obra_id is null
      and (
        upper(translate(e.description,'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC')) like '%ALFENAS%'
        or upper(translate(e.description,'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC')) like '%CRISTAIS%'
        or e.id in (
          'f8f08296-f8fc-4f3d-9485-4ca2d92d81bd'::uuid, -- SANECAMP -> Cristais
          '8916d75f-03c5-4791-8717-f4c4271040ed'::uuid, -- Paraiba Ferragens -> Cristais
          '63b7d80f-4d5e-49fa-830f-b7bdec822fb6'::uuid, -- Leal Gesso -> Alfenas
          'a83fe906-3516-4c59-9c2e-136913df7522'::uuid, -- Madeireira -> Cristais
          'edd997cf-ef47-4cc6-8350-70836869bb52'::uuid  -- G4 Construcoes -> Cristais
        )
      )
  )
  select count(*),
         count(*) filter (where chart_of_account_id is null and obra_id is null),
         coalesce(sum(amount),0)
    into v_qtd, v_estado_ok, v_valor
  from alvos;

  if v_qtd <> 58 or v_estado_ok <> 58 or v_valor <> 134172.06 then
    raise exception 'Precondicao obras divergiu: qtd %, estado_ok %, valor % (esperado 58/58/134172.06)',
      v_qtd, v_estado_ok, v_valor;
  end if;

  -- Betoneira: valida as cinco parcelas e o estado anterior de cada uma.
  with esperado(entry_id, valor, old_code, partidas) as (values
    ('ab267ee4-4a96-4999-b1c3-d46f2182d8e8'::uuid, 1004.52::numeric, null::text, 0),
    ('4110f555-e1c8-48f8-bf97-8c4015c7e315'::uuid, 1004.52, null, 0),
    ('f0b55909-0465-479b-a4f5-f2766bd974d7'::uuid, 1013.55, '8.2', 2),
    ('8c4fb983-2534-43d7-be08-72214e28d982'::uuid, 1004.52, '8.2', 0),
    ('bfc2ad8f-6f2c-4aa2-82c6-fe6fb97fe1cf'::uuid, 1004.52, '8.2', 0)
  ), estado as (
    select x.*, e.amount,
           case when e.chart_of_account_id is null then null else c.code end as atual_code,
           (select count(*) from public.partidas p where p.entry_id=e.id) as atuais_partidas
    from esperado x
    join public.entries e on e.id=x.entry_id and e.company_id=v_incorporadora_id
    left join public.chart_of_accounts c on c.id=e.chart_of_account_id
  )
  select count(*),
         count(*) filter (where amount=valor and atual_code is not distinct from old_code
                           and atuais_partidas=partidas),
         coalesce(sum(amount),0)
    into v_qtd, v_estado_ok, v_valor
  from estado;

  if v_qtd <> 5 or v_estado_ok <> 5 or v_valor <> 5031.63 then
    raise exception 'Precondicao betoneira divergiu: qtd %, estado_ok %, valor % (esperado 5/5/5031.63)',
      v_qtd, v_estado_ok, v_valor;
  end if;

  -- Conta pessoal: todos os 27 itens do periodo seguem sem conta e sem conta financeira.
  select count(*),
         count(*) filter (where e.chart_of_account_id is null and e.account_id is null),
         coalesce(sum(e.amount),0)
    into v_qtd, v_estado_ok, v_valor
  from public.entries e
  where e.company_id = v_pessoal_id
    and coalesce(e.competency_date,e.issue_date,e.due_date)
        between date '2026-04-01' and date '2026-06-30'
    and e.transfer_id is null
    and e.chart_of_account_id is null;

  if v_qtd <> 27 or v_estado_ok <> 27 or v_valor <> 99830.71 then
    raise exception 'Precondicao conta pessoal divergiu: qtd %, estado_ok %, valor % (esperado 27/27/99830.71)',
      v_qtd, v_estado_ok, v_valor;
  end if;

  -- Contas novas da Incorporadora: grupo Imobilizado + conta analitica da betoneira.
  insert into public.chart_of_accounts
    (company_id,tipo,code,name,parent_id,nature,redutora,is_analytical,sort_order,active)
  values
    (v_incorporadora_id,'patrimonial','1.4','Imobilizado',null,'asset',false,false,1004000,true);

  insert into public.chart_of_accounts
    (company_id,tipo,code,name,parent_id,nature,redutora,is_analytical,sort_order,active)
  select v_incorporadora_id,'patrimonial','1.4.01','Maquinas e equipamentos',id,
         'asset',false,true,1004001,true
  from public.chart_of_accounts
  where company_id=v_incorporadora_id and tipo='patrimonial' and code='1.4';

  select id into strict v_imobilizado_id
  from public.chart_of_accounts
  where company_id=v_incorporadora_id and tipo='patrimonial' and code='1.4.01';

  -- Plano patrimonial minimo da conta pessoal.
  insert into public.chart_of_accounts
    (company_id,tipo,code,name,parent_id,nature,redutora,is_analytical,sort_order,active)
  values
    (v_pessoal_id,'patrimonial','1','ATIVO',null,'asset',false,false,1000000,true),
    (v_pessoal_id,'patrimonial','3','PATRIMONIO LIQUIDO',null,'equity',false,false,3000000,true);

  insert into public.chart_of_accounts
    (company_id,tipo,code,name,parent_id,nature,redutora,is_analytical,sort_order,active)
  select v_pessoal_id,'patrimonial','1.1','Consorcios a contemplar',id,
         'asset',false,true,1001000,true
  from public.chart_of_accounts
  where company_id=v_pessoal_id and tipo='patrimonial' and code='1';

  insert into public.chart_of_accounts
    (company_id,tipo,code,name,parent_id,nature,redutora,is_analytical,sort_order,active)
  select v_pessoal_id,'patrimonial','3.1','Movimentacoes pessoais do titular',id,
         'equity',true,true,3001000,true
  from public.chart_of_accounts
  where company_id=v_pessoal_id and tipo='patrimonial' and code='3';

  select id into strict v_consorcio_id from public.chart_of_accounts
  where company_id=v_pessoal_id and tipo='patrimonial' and code='1.1';
  select id into strict v_pessoal_mov_id from public.chart_of_accounts
  where company_id=v_pessoal_id and tipo='patrimonial' and code='3.1';

  -- Capitaliza os 58 custos e vincula cada lancamento a sua obra.
  with alvos as (
    select e.id,
      case
        when upper(translate(e.description,'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC')) like '%ALFENAS%'
          then v_alfenas_id
        when upper(translate(e.description,'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC')) like '%CRISTAIS%'
          then v_cristais_id
        when e.id='63b7d80f-4d5e-49fa-830f-b7bdec822fb6'::uuid
          then v_alfenas_id
        else v_cristais_id
      end as destino_obra
    from public.entries e
    where e.company_id=v_incorporadora_id
      and coalesce(e.competency_date,e.issue_date,e.due_date)
          between date '2026-04-01' and date '2026-06-30'
      and e.chart_of_account_id is null and e.obra_id is null and e.transfer_id is null
      and (
        upper(translate(e.description,'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC')) like '%ALFENAS%'
        or upper(translate(e.description,'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC')) like '%CRISTAIS%'
        or e.id in (
          'f8f08296-f8fc-4f3d-9485-4ca2d92d81bd'::uuid,
          '8916d75f-03c5-4791-8717-f4c4271040ed'::uuid,
          '63b7d80f-4d5e-49fa-830f-b7bdec822fb6'::uuid,
          'a83fe906-3516-4c59-9c2e-136913df7522'::uuid,
          'edd997cf-ef47-4cc6-8350-70836869bb52'::uuid
        )
      )
  )
  update public.entries e
     set obra_id=a.destino_obra, chart_of_account_id=v_estoque_id
    from alvos a
   where e.id=a.id;

  get diagnostics v_alterados = row_count;
  if v_alterados <> 58 then
    raise exception 'UPDATE obras atingiu % linhas; esperado 58', v_alterados;
  end if;

  update public.obras
     set conta_estoque_id=v_estoque_id
   where id in (v_alfenas_id,v_cristais_id) and conta_estoque_id is null;

  get diagnostics v_alterados = row_count;
  if v_alterados <> 2 then
    raise exception 'Vinculo obras->estoque atingiu % linhas; esperado 2', v_alterados;
  end if;

  -- Somente os cinco custos com conta pagadora conhecida entram completos no razao.
  insert into public.partidas (entry_id,conta_id,natureza,valor,memo)
  select e.id,v.conta,v.natureza,e.amount,'capitalizacao obras abr-jun/2026'
  from public.entries e
  join public.accounts a on a.id=e.account_id and a.conta_contabil_id is not null
  cross join lateral (values
    (v_estoque_id,'debito'),
    (a.conta_contabil_id,'credito')
  ) as v(conta,natureza)
  where e.company_id=v_incorporadora_id
    and e.obra_id in (v_alfenas_id,v_cristais_id)
    and e.chart_of_account_id=v_estoque_id
    and e.payment_date is not null
    and coalesce(e.competency_date,e.issue_date,e.due_date)
        between date '2026-04-01' and date '2026-06-30'
    and not exists (select 1 from public.partidas p where p.entry_id=e.id);

  get diagnostics v_alterados = row_count;
  if v_alterados <> 10 then
    raise exception 'Partidas de obras inseridas: %; esperado 10 (5 pares)', v_alterados;
  end if;

  -- Reclassifica as cinco parcelas da betoneira para imobilizado.
  update public.entries
     set chart_of_account_id=v_imobilizado_id
   where id in (
    'ab267ee4-4a96-4999-b1c3-d46f2182d8e8'::uuid,
    '4110f555-e1c8-48f8-bf97-8c4015c7e315'::uuid,
    'f0b55909-0465-479b-a4f5-f2766bd974d7'::uuid,
    '8c4fb983-2534-43d7-be08-72214e28d982'::uuid,
    'bfc2ad8f-6f2c-4aa2-82c6-fe6fb97fe1cf'::uuid
   );

  get diagnostics v_alterados = row_count;
  if v_alterados <> 5 then
    raise exception 'UPDATE betoneira atingiu % linhas; esperado 5', v_alterados;
  end if;

  update public.partidas p
     set conta_id=v_imobilizado_id,
         memo='reclassificacao betoneira 3/5 para imobilizado'
    from public.chart_of_accounts c
   where p.entry_id='f0b55909-0465-479b-a4f5-f2766bd974d7'::uuid
     and p.conta_id=c.id and c.code='8.2' and c.tipo='resultado'
     and p.natureza='debito' and p.valor=1013.55;

  get diagnostics v_alterados = row_count;
  if v_alterados <> 1 then
    raise exception 'Partida da betoneira 3/5 corrigida: %; esperado 1', v_alterados;
  end if;

  -- Classifica a conta pessoal: consorcio em ativo; demais movimentos como redutora do PL.
  update public.entries e
     set chart_of_account_id = case
       when upper(translate(e.description,'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC')) like '%CONSORCIO%'
         then v_consorcio_id
       else v_pessoal_mov_id
     end
   where e.company_id=v_pessoal_id
     and coalesce(e.competency_date,e.issue_date,e.due_date)
         between date '2026-04-01' and date '2026-06-30'
     and e.chart_of_account_id is null and e.transfer_id is null;

  get diagnostics v_alterados = row_count;
  if v_alterados <> 27 then
    raise exception 'UPDATE conta pessoal atingiu % linhas; esperado 27', v_alterados;
  end if;

  -- Pos-condicoes dentro da propria transacao.
  select count(*),coalesce(sum(e.amount),0)
    into v_qtd,v_valor
  from public.entries e
  where e.company_id in (v_incorporadora_id,v_pessoal_id)
    and coalesce(e.competency_date,e.issue_date,e.due_date)
        between date '2026-04-01' and date '2026-06-30'
    and e.chart_of_account_id is null and e.transfer_id is null;

  if v_qtd <> 0 or v_valor <> 0 then
    raise exception 'Pos-condicao NC-2 falhou: restaram % itens / valor %',v_qtd,v_valor;
  end if;

  if exists (
    select 1 from public.partidas p
    where p.entry_id in (
      select distinct p2.entry_id from public.partidas p2
      where p2.memo in ('capitalizacao obras abr-jun/2026','reclassificacao betoneira 3/5 para imobilizado')
    )
    group by p.entry_id
    having sum(case when p.natureza='debito' then p.valor else 0 end)
         <> sum(case when p.natureza='credito' then p.valor else 0 end)
  ) then
    raise exception 'Pos-condicao partidas falhou: ha lancamento desbalanceado';
  end if;

  raise notice 'Fechamento concluido: 58 obras (R$134.172,06), 5 parcelas de betoneira (R$5.031,63) e 27 pessoais (R$99.830,71)';
end;
$migration$;
