-- Migration: separacao_plano_de_contas_por_empresa
-- STATUS: NAO APLICADA — aguardando revisão e aprovação do Luiz (regra-mãe do projeto).
-- DRY-RUN 2026-07-18: o bloco inteiro foi executado em produção com rollback proposital
-- (exceção no fim) — todas as guardas passaram. Contagens do dry-run:
--   entries_remapeados=79 · partidas_remapeadas=32 · pes_consorcio=1 · pes_movpessoais=9
--   · devolvidos_fila=5 · regras_clonadas=6
--
-- Decisão do Luiz (2026-07-18): cada empresa tem o SEU plano de contas, conforme a planilha
-- RB7_Plano_de_Contas_DRE.xlsx ("como tem que ser feito"). Isto REVOGA o modelo
-- "compartilhado + específico" da Fase 1 (20260715173423): as 106 contas de resultado com
-- company_id NULL deixam de ser compartilhadas.
--
-- O que esta migration faz (atômico, aborta inteiro em qualquer guarda):
--   1. As 106 contas de resultado compartilhadas viram contas da RB7 DIGITAL (ids preservados —
--      zero remap pra Digital: 807 transactions de cartão, 60 hotmart_product_map e todos os
--      entries da Digital continuam apontando pros mesmos ids). Exceção: a conta "4.6 Custo das
--      Obras Vendidas (CPV)" vai pra RB7 INCORPORADORA (é o CPV de obras).
--   2. Cria o plano PRÓPRIO de cada empresa:
--        INCORPORADORA — aba "DRE Incorporadora" da planilha (receita da venda, deduções,
--          CPV, despesas fixas) + espelhos das contas que ela já usa (mesmos código/nome/natureza).
--        PARTICIPAÇÕES — aba "RB7 Participações" Bloco A (receita de participações por
--          participada, despesas da holding, IRPJ).
--        MOLHO DIGITAL — plano mínimo (não está na planilha; é participada).
--        CONTA PESSOAL — espelhos das contas de resultado que ela já usa (não está na planilha).
--   3. Remapeia os 79 entries de fora da Digital pras contas das suas empresas
--      (natureza SEMPRE preservada → DRE por empresa não muda de valor nem de seção).
--   4. Conserta as 15 classificações em conta PATRIMONIAL de outra empresa:
--        Conta Pessoal (10): CONCAMP → "1.1 Consorcios a contemplar" (PES); IPVA/licenciamento/
--          pneus e faturas PF → "3.1 Movimentacoes pessoais do titular" (política aprovada em
--          18/07). O Balanço da DIGITAL deixa de carregar esses itens pessoais.
--        Incorporadora (4, R$ 2.785,67) e Participações (1, R$ 502,51): estavam em conta da
--          Holding/Digital sem equivalente inequívoco → voltam pra "A classificar" (precedente
--          "devolver inferências pra UI" de 18/07). Entram na NC-2 dessas empresas.
--   5. Regras de sugestão (regras_conta): as 4 globais viram da Digital; IOF/TARIFA são
--      clonadas pra INCORPORADORA (8.2), CONTA PESSOAL (8.2) e PARTICIPAÇÕES (2.3).
--   6. Recria finalizar_venda_obra: o CPV passa a ser achado por (empresa da obra, code 4.6)
--      em vez de (company_id is null, code 4.6).
--
-- Invariantes verificadas no fim (abortam o apply se falharem):
--   • zero conta com company_id NULL;
--   • zero entry/partida/transaction/regra apontando pra conta de RESULTADO de outra empresa;
--   • totais por (empresa, natureza) dos entries em contas de resultado IDÊNTICOS pré/pós;
--   • débito/crédito totais das partidas inalterados.

do $$
declare
  c_dig constant uuid := 'e16aa82e-b78a-46d2-bdb1-85ce03369a4f';
  c_inc constant uuid := '7bd4e9e2-3d39-4f84-9534-50bf840abc6b';
  c_par constant uuid := 'e2a6c194-ba94-4225-8ade-8d883f504ca3';
  c_mol constant uuid := 'a97d0427-f3b7-4a14-a789-8fb1478de835';
  c_pes constant uuid := '1b3c452e-3ff3-43eb-bdd9-e84dc0f790c9';
  v_n bigint;
  v_txt text;
  v_resumo text := '';
begin
  if (select count(*) from public.companies co where co.id = c_dig and co.name = 'RB7 DIGITAL') <> 1
     or (select count(*) from public.companies co where co.id = c_inc and co.name = 'RB7 INCORPORADORA') <> 1
     or (select count(*) from public.companies co where co.id = c_par and co.name = 'RB7 PARTICIPAÇÕES') <> 1
     or (select count(*) from public.companies co where co.id = c_mol and co.name = 'MOLHO DIGITAL') <> 1
     or (select count(*) from public.companies co where co.id = c_pes and co.name = 'RAFAEL BRITO - CONTA PESSOAL') <> 1 then
    raise exception 'IDs/nomes de empresas nao batem com o esperado';
  end if;

  if exists (select 1 from public.closed_periods) then
    raise exception 'Ha periodos fechados; reavaliar antes de aplicar';
  end if;

  create temp table old_shared on commit drop as
    select id, code, name, nature from public.chart_of_accounts
    where company_id is null and tipo = 'resultado';
  if (select count(*) from old_shared) <> 106 then
    raise exception 'Esperava 106 contas de resultado compartilhadas, achei %',
      (select count(*) from old_shared);
  end if;

  select count(*) into v_n
  from public.transactions t
  join old_shared os on os.id = t.chart_of_account_id
  join public.invoices i on i.id = t.invoice_id
  join public.accounts a on a.id = i.account_id
  where a.company_id <> c_dig;
  if v_n <> 0 then
    raise exception 'Ha % transactions de cartao fora da Digital em conta compartilhada', v_n;
  end if;

  create temp table pre_resultado on commit drop as
    select e.company_id, ca.nature, count(*) qtd, sum(e.amount) total
    from public.entries e
    join public.chart_of_accounts ca on ca.id = e.chart_of_account_id
    where ca.tipo = 'resultado'
    group by 1, 2;

  create temp table pre_partidas on commit drop as
    select coalesce(sum(valor) filter (where natureza = 'debito'), 0) deb,
           coalesce(sum(valor) filter (where natureza = 'credito'), 0) cred,
           count(*) qtd
    from public.partidas;

  create temp table novas (
    company uuid, code text, name text, nature text, analytical boolean, parent_code text, sort int
  ) on commit drop;

  insert into novas values
    (c_inc, '1',      'RECEITA DA VENDA DE OBRAS',            'revenue',       false, null,    2000),
    (c_inc, '1.1',    'Receita da venda de casas',            'revenue',       true,  '1',     2005),
    (c_inc, '2',      'DEDUÇÕES DA VENDA',                    'deduction',     false, null,    2010),
    (c_inc, '2.1',    'Impostos sobre a venda',               'deduction',     false, '2',     2015),
    (c_inc, '2.1.01', 'ISS',                                  'deduction',     true,  '2.1',   2020),
    (c_inc, '2.2',    'Comissão de corretagem',               'deduction',     true,  '2',     2025),
    (c_inc, '4',      'CUSTO DAS OBRAS VENDIDAS',             'variable_cost', false, null,    2030),
    (c_inc, '6',      'DESPESAS FIXAS DA EMPRESA',            'fixed_cost',    false, null,    2040),
    (c_inc, '6.1',    'Despesas com Pessoal',                 'fixed_cost',    false, '6',     2045),
    (c_inc, '6.1.02', 'Encargos (INSS / FGTS)',               'fixed_cost',    true,  '6.1',   2050),
    (c_inc, '6.1.05', 'PJs / Prestadores Fixos',              'fixed_cost',    true,  '6.1',   2055),
    (c_inc, '6.3',    'Despesas Administrativas',             'fixed_cost',    false, '6',     2060),
    (c_inc, '6.3.02', 'Utilidades (energia/água/internet)',   'fixed_cost',    true,  '6.3',   2065),
    (c_inc, '6.3.03', 'Contabilidade / Honorários',           'fixed_cost',    true,  '6.3',   2070),
    (c_inc, '6.3.11', 'Manutenção e Reparos',                 'fixed_cost',    true,  '6.3',   2075),
    (c_inc, '6.3.17', 'Exames Admissional e Demissionais',    'fixed_cost',    true,  '6.3',   2080),
    (c_inc, '8',      'RESULTADO FINANCEIRO',                 'financial',     false, null,    2085),
    (c_inc, '8.2',    'Despesas Financeiras',                 'financial',     true,  '8',     2090),
    (c_inc, '11',     'IRPJ e CSLL',                          'tax',           true,  null,    2095);

  insert into novas values
    (c_par, '1',      'RECEITA DE PARTICIPAÇÕES',                          'revenue',    false, null,   3000),
    (c_par, '1.1',    'Distribuição de Lucros / Equivalência Patrimonial', 'revenue',    false, '1',    3005),
    (c_par, '1.1.01', 'RB7 Digital',                                       'revenue',    true,  '1.1',  3010),
    (c_par, '1.1.02', 'RB7 Incorporadora',                                 'revenue',    true,  '1.1',  3015),
    (c_par, '1.1.03', 'Molho Digital (Cris)',                              'revenue',    true,  '1.1',  3020),
    (c_par, '1.1.04', 'Zizem (Maycon)',                                    'revenue',    true,  '1.1',  3025),
    (c_par, '1.1.05', 'Outras participações',                              'revenue',    true,  '1.1',  3030),
    (c_par, '1.2',    'Outras Receitas da Holding',                        'revenue',    false, '1',    3035),
    (c_par, '1.2.01', 'Serviços intercompany / gestão',                    'revenue',    true,  '1.2',  3040),
    (c_par, '1.2.02', 'Receitas financeiras de aplicações',                'revenue',    true,  '1.2',  3045),
    (c_par, '1.2.03', 'Outras receitas',                                   'revenue',    true,  '1.2',  3050),
    (c_par, '2',      'DESPESAS DA HOLDING',                               'fixed_cost', false, null,   3055),
    (c_par, '2.1',    'Despesas Administrativas',                          'fixed_cost', false, '2',    3060),
    (c_par, '2.1.01', 'Honorários contábeis',                              'fixed_cost', true,  '2.1',  3065),
    (c_par, '2.1.02', 'Jurídico e societário',                             'fixed_cost', true,  '2.1',  3070),
    (c_par, '2.1.03', 'Consultorias',                                      'fixed_cost', true,  '2.1',  3075),
    (c_par, '2.1.04', 'Taxas, emolumentos e cartório',                     'fixed_cost', true,  '2.1',  3080),
    (c_par, '2.2',    'Despesas com Pessoal',                              'fixed_cost', false, '2',    3085),
    (c_par, '2.2.01', 'Pró-labore dos sócios',                             'fixed_cost', true,  '2.2',  3090),
    (c_par, '2.2.02', 'Encargos',                                          'fixed_cost', true,  '2.2',  3095),
    -- planilha lista 2.3 sob "Despesas da Holding" mas o conteúdo (tarifas/juros/IOF) é
    -- natureza financeira no nosso modelo — mantém a seção Resultado Financeiro da DRE
    (c_par, '2.3',    'Despesas Financeiras e Bancárias',                  'financial',  true,  '2',    3100),
    (c_par, '4',      'IRPJ / CSLL',                                       'tax',        true,  null,   3105);

  insert into novas values
    (c_mol, '1',   'RECEITAS',                'revenue',    false, null, 4000),
    (c_mol, '1.1', 'Receita de co-produção',  'revenue',    true,  '1',  4005),
    (c_mol, '1.8', 'Outras Receitas',         'revenue',    true,  '1',  4010),
    (c_mol, '6',   'DESPESAS',                'fixed_cost', false, null, 4015),
    (c_mol, '6.1', 'Despesas Gerais',         'fixed_cost', true,  '6',  4020),
    (c_mol, '8',   'RESULTADO FINANCEIRO',    'financial',  false, null, 4025),
    (c_mol, '8.2', 'Despesas Financeiras',    'financial',  true,  '8',  4030);

  insert into novas values
    (c_pes, '1',      'RECEITAS',                              'revenue',       false, null,   5000),
    (c_pes, '1.8',    'Outras Receitas',                       'revenue',       true,  '1',    5005),
    (c_pes, '2',      'DEDUÇÕES',                              'deduction',     false, null,   5010),
    (c_pes, '2.3',    'Taxas de Adquirência / Gateway',        'deduction',     false, '2',    5015),
    (c_pes, '2.3.01', 'Taxa de Cartão de Crédito',             'deduction',     true,  '2.3',  5020),
    (c_pes, '4',      'CUSTOS VARIÁVEIS',                      'variable_cost', false, null,   5025),
    (c_pes, '4.1',    'Tráfego',                               'variable_cost', false, '4',    5030),
    (c_pes, '4.1.01', 'Meta Ads (Facebook / Instagram)',       'variable_cost', true,  '4.1',  5035),
    (c_pes, '6',      'DESPESAS',                              'fixed_cost',    false, null,   5040),
    (c_pes, '6.1',    'Despesas com Pessoal',                  'fixed_cost',    false, '6',    5045),
    (c_pes, '6.1.01', 'Salários e Ordenados',                  'fixed_cost',    true,  '6.1',  5050),
    (c_pes, '6.1.03', 'Benefícios (VR / VA / VT / Saúde)',     'fixed_cost',    true,  '6.1',  5055),
    (c_pes, '6.1.05', 'PJs / Prestadores Fixos',               'fixed_cost',    true,  '6.1',  5060),
    (c_pes, '6.3',    'Despesas Administrativas',              'fixed_cost',    false, '6',    5065),
    (c_pes, '6.3.02', 'Utilidades (energia/água/internet)',    'fixed_cost',    true,  '6.3',  5070),
    (c_pes, '6.3.08', 'Materiais de Uso e Consumo',            'fixed_cost',    true,  '6.3',  5075),
    (c_pes, '8',      'RESULTADO FINANCEIRO',                  'financial',     false, null,   5080),
    (c_pes, '8.2',    'Despesas Financeiras',                  'financial',     true,  '8',    5085);

  insert into public.chart_of_accounts
    (company_id, tipo, code, name, nature, is_analytical, sort_order, active, redutora, rateio_por_produto)
  select company, 'resultado', code, name, nature, analytical, sort, true, false, false
  from novas;

  update public.chart_of_accounts c
     set parent_id = p.id
  from novas n
  join public.chart_of_accounts p
    on p.company_id = n.company and p.tipo = 'resultado' and p.code = n.parent_code
  where c.company_id = n.company and c.tipo = 'resultado' and c.code = n.code
    and n.parent_code is not null;

  update public.chart_of_accounts
     set company_id = c_dig
   where company_id is null and tipo = 'resultado' and code <> '4.6';

  update public.chart_of_accounts c
     set company_id = c_inc,
         parent_id = (select p.id from public.chart_of_accounts p
                      where p.company_id = c_inc and p.tipo = 'resultado' and p.code = '4'),
         sort_order = 2035
   where c.company_id is null and c.tipo = 'resultado' and c.code = '4.6';

  if exists (select 1 from public.chart_of_accounts where company_id is null) then
    raise exception 'Sobrou conta com company_id NULL';
  end if;

  create temp table remap (
    company uuid, old_id uuid, new_id uuid, old_nature text, new_nature text
  ) on commit drop;
  insert into remap (company, old_id, new_id, old_nature, new_nature)
  with pares(company, old_code, new_code) as (
    values
      (c_inc, '2.1.01', '2.1.01'), (c_inc, '6.1.02', '6.1.02'), (c_inc, '6.1.05', '6.1.05'),
      (c_inc, '6.3.02', '6.3.02'), (c_inc, '6.3.03', '6.3.03'), (c_inc, '6.3.11', '6.3.11'),
      (c_inc, '6.3.17', '6.3.17'), (c_inc, '8.2', '8.2'),       (c_inc, '11', '11'),
      (c_par, '6.3.03', '2.1.01'), (c_par, '6.1.02', '2.2.02'),
      (c_par, '8.2',    '2.3'),    (c_par, '1.8',    '1.2.03'),
      (c_mol, '1.8', '1.8'),
      (c_pes, '1.8', '1.8'),       (c_pes, '2.3.01', '2.3.01'), (c_pes, '4.1.01', '4.1.01'),
      (c_pes, '6.1.01', '6.1.01'), (c_pes, '6.1.03', '6.1.03'), (c_pes, '6.1.05', '6.1.05'),
      (c_pes, '6.3.02', '6.3.02'), (c_pes, '6.3.08', '6.3.08'), (c_pes, '8.2', '8.2')
  )
  select p.company, os.id as old_id, novo.id as new_id, os.nature as old_nature, novo.nature as new_nature
  from pares p
  join old_shared os on os.code = p.old_code
  join public.chart_of_accounts novo
    on novo.company_id = p.company and novo.tipo = 'resultado' and novo.code = p.new_code;

  if exists (select 1 from remap where old_nature <> new_nature) then
    raise exception 'Remap mudaria a natureza de alguma conta — abortando';
  end if;

  select string_agg(distinct os.code, ', ') into v_txt
  from public.entries e
  join old_shared os on os.id = e.chart_of_account_id
  where e.company_id <> c_dig
    and not exists (select 1 from remap m where m.company = e.company_id and m.old_id = os.id);
  if v_txt is not null then
    raise exception 'Entries fora da Digital em contas sem destino mapeado: %', v_txt;
  end if;

  update public.entries e
     set chart_of_account_id = m.new_id
  from remap m
  where m.company = e.company_id and e.chart_of_account_id = m.old_id;
  get diagnostics v_n = row_count;
  v_resumo := v_resumo || 'entries_remapeados=' || v_n;

  update public.partidas p
     set conta_id = m.new_id
  from public.entries e, remap m
  where p.entry_id = e.id and m.company = e.company_id and p.conta_id = m.old_id;
  get diagnostics v_n = row_count;
  v_resumo := v_resumo || ' partidas_remapeadas=' || v_n;

  select count(*) into v_n
  from public.entries e
  join public.chart_of_accounts ca on ca.id = e.chart_of_account_id
  join public.partidas p on p.entry_id = e.id
  where ca.company_id is not null and ca.company_id <> e.company_id;
  if v_n <> 0 then
    raise exception 'Entries com conta de outra empresa ganharam partidas (%) — revisar', v_n;
  end if;

  update public.entries e
     set chart_of_account_id = (select id from public.chart_of_accounts
                                where company_id = c_pes and tipo = 'patrimonial' and code = '1.1')
  from public.chart_of_accounts ca
  where ca.id = e.chart_of_account_id and e.company_id = c_pes
    and ca.company_id = c_dig and ca.tipo = 'patrimonial' and ca.code = '1.2.01';
  get diagnostics v_n = row_count;
  v_resumo := v_resumo || ' pes_consorcio=' || v_n;

  update public.entries e
     set chart_of_account_id = (select id from public.chart_of_accounts
                                where company_id = c_pes and tipo = 'patrimonial' and code = '3.1')
  from public.chart_of_accounts ca
  where ca.id = e.chart_of_account_id and e.company_id = c_pes
    and ca.company_id = c_dig and ca.tipo = 'patrimonial' and ca.code in ('1.4.04', '2.1.09');
  get diagnostics v_n = row_count;
  v_resumo := v_resumo || ' pes_movpessoais=' || v_n;

  update public.entries e
     set chart_of_account_id = null
  from public.chart_of_accounts ca
  where ca.id = e.chart_of_account_id
    and ca.company_id is not null and ca.company_id <> e.company_id;
  get diagnostics v_n = row_count;
  v_resumo := v_resumo || ' devolvidos_fila=' || v_n;
  if v_n <> 5 then
    raise exception 'Esperava devolver 5 entries pra fila, devolvi %', v_n;
  end if;

  update public.regras_conta set company_id = c_dig where company_id is null;

  insert into public.regras_conta (padrao, match_type, chart_of_account_id, aplica_em, company_id, prioridade, ativa)
  select r.padrao, r.match_type, alvo.id, r.aplica_em, alvo.company_id, r.prioridade, r.ativa
  from public.regras_conta r
  join old_shared os on os.id = r.chart_of_account_id and os.code = '8.2'
  cross join lateral (
    select ca.id, ca.company_id from public.chart_of_accounts ca
    where ca.tipo = 'resultado'
      and ((ca.company_id = c_inc and ca.code = '8.2')
        or (ca.company_id = c_pes and ca.code = '8.2')
        or (ca.company_id = c_par and ca.code = '2.3'))
  ) alvo
  where r.company_id = c_dig;
  get diagnostics v_n = row_count;
  v_resumo := v_resumo || ' regras_clonadas=' || v_n;

  select count(*) into v_n from public.entries e
  join public.chart_of_accounts ca on ca.id = e.chart_of_account_id
  where ca.company_id <> e.company_id;
  if v_n <> 0 then raise exception 'Pos: % entries com conta de outra empresa', v_n; end if;

  select count(*) into v_n from public.partidas p
  join public.entries e on e.id = p.entry_id
  join public.chart_of_accounts ca on ca.id = p.conta_id
  where ca.tipo = 'resultado' and ca.company_id <> e.company_id;
  if v_n <> 0 then raise exception 'Pos: % partidas de resultado cruzando empresa', v_n; end if;

  select count(*) into v_n from public.transactions t
  join public.chart_of_accounts ca on ca.id = t.chart_of_account_id
  join public.invoices i on i.id = t.invoice_id
  join public.accounts a on a.id = i.account_id
  where ca.company_id <> a.company_id;
  if v_n <> 0 then raise exception 'Pos: % transactions com conta de outra empresa', v_n; end if;

  select count(*) into v_n from public.hotmart_product_map pm
  join public.chart_of_accounts ca on ca.id = pm.chart_of_account_id
  where ca.company_id <> c_dig;
  if v_n <> 0 then raise exception 'Pos: % hotmart_product_map fora da Digital', v_n; end if;

  select count(*) into v_n from public.regras_conta r
  join public.chart_of_accounts ca on ca.id = r.chart_of_account_id
  where r.company_id is null or ca.company_id <> r.company_id;
  if v_n <> 0 then raise exception 'Pos: % regras_conta inconsistentes', v_n; end if;

  select count(*) into v_n from public.accounts a
  join public.chart_of_accounts ca on ca.id = a.conta_contabil_id
  where ca.company_id <> a.company_id;
  if v_n <> 0 then raise exception 'Pos: % accounts.conta_contabil de outra empresa', v_n; end if;

  select count(*) into v_n from public.obras o
  join public.chart_of_accounts ca on ca.id = o.conta_estoque_id
  where ca.company_id <> o.company_id;
  if v_n <> 0 then raise exception 'Pos: % obras com conta de estoque de outra empresa', v_n; end if;

  select count(*) into v_n
  from (
    select e.company_id, ca.nature, count(*) qtd, sum(e.amount) total
    from public.entries e
    join public.chart_of_accounts ca on ca.id = e.chart_of_account_id
    where ca.tipo = 'resultado'
    group by 1, 2
  ) pos
  full outer join pre_resultado pre using (company_id, nature)
  where pre.qtd is distinct from pos.qtd or pre.total is distinct from pos.total;
  if v_n <> 0 then
    raise exception 'Pos: totais por empresa/natureza mudaram (% linhas divergentes)', v_n;
  end if;

  select count(*) into v_n
  from pre_partidas pre, (
    select coalesce(sum(valor) filter (where natureza = 'debito'), 0) deb,
           coalesce(sum(valor) filter (where natureza = 'credito'), 0) cred,
           count(*) qtd
    from public.partidas
  ) pos
  where pre.deb is distinct from pos.deb
     or pre.cred is distinct from pos.cred
     or pre.qtd is distinct from pos.qtd;
  if v_n <> 0 then
    raise exception 'Pos: totais de partidas mudaram';
  end if;

  raise notice 'Separacao do plano por empresa concluida — %', v_resumo;
end;
$$;

-- ============ finalizar_venda_obra: CPV por EMPRESA da obra ============
-- Idêntica à versão de 20260718165601, exceto o lookup do CPV (antes: company_id is null).
create or replace function public.finalizar_venda_obra(p_obra uuid, p_data_venda date)
returns table(cpv_entry_id uuid, custo numeric)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_obra public.obras%rowtype;
  v_cpv uuid;
  v_qtd bigint;
  v_custo numeric;
  v_incompletos bigint;
  v_saldo numeric;
  v_entry uuid;
begin
  if not coalesce(public.is_admin(),false) then
    raise exception 'Apenas administradores podem finalizar a venda da obra'
      using errcode='insufficient_privilege';
  end if;
  if p_data_venda is null or p_data_venda not between date '2015-01-01' and date '2040-01-01' then
    raise exception 'Informe uma data de venda valida';
  end if;

  select * into strict v_obra from public.obras where id=p_obra for update;
  if v_obra.status<>'em_andamento' or v_obra.data_venda is not null or v_obra.cpv_entry_id is not null then
    raise exception 'A obra ja foi vendida ou esta em estado incompativel';
  end if;
  if v_obra.conta_estoque_id is null then
    raise exception 'A obra nao possui conta de estoque configurada';
  end if;
  if exists(select 1 from public.closed_periods cp
            where cp.company_id=v_obra.company_id and cp.period=to_char(p_data_venda,'YYYY-MM')) then
    raise exception 'O periodo da venda esta fechado. Reabra antes de finalizar.';
  end if;

  select id into strict v_cpv from public.chart_of_accounts
  where company_id = v_obra.company_id and tipo='resultado' and code='4.6'
    and nature='variable_cost' and active=true and is_analytical=true;

  with estado as (
    select e.id,e.amount,e.account_id,
      coalesce((select sum(case when p.natureza='debito' then p.valor else -p.valor end)
                from public.partidas p where p.entry_id=e.id and p.conta_id=v_obra.conta_estoque_id),0) estoque_liquido,
      coalesce((select sum(p.valor) filter(where p.natureza='debito') from public.partidas p where p.entry_id=e.id),0) debitos,
      coalesce((select sum(p.valor) filter(where p.natureza='credito') from public.partidas p where p.entry_id=e.id),0) creditos
    from public.entries e
    where e.obra_id=p_obra and e.chart_of_account_id=v_obra.conta_estoque_id
      and e.status not in ('cancelled','refunded')
  )
  select count(*),coalesce(sum(amount),0),
         count(*) filter(where account_id is null or estoque_liquido<>amount or debitos<>creditos)
    into v_qtd,v_custo,v_incompletos
  from estado;

  select coalesce(sum(case when p.natureza='debito' then p.valor else -p.valor end),0)
    into v_saldo
  from public.partidas p
  join public.entries e on e.id=p.entry_id
  where e.obra_id=p_obra and p.conta_id=v_obra.conta_estoque_id;

  if v_qtd=0 or v_custo<=0 then
    raise exception 'A obra nao possui custo de estoque para baixar';
  end if;
  if v_incompletos<>0 or v_saldo<>v_custo then
    raise exception 'Ainda existem % contrapartidas pendentes. Resolva pela UI antes da venda.',v_incompletos;
  end if;

  insert into public.entries(
    company_id,type,description,amount,issue_date,due_date,competency_date,
    payment_date,status,counterparty,notes,created_by,chart_of_account_id,obra_id
  ) values (
    v_obra.company_id,'payable','CPV - Venda da obra '||v_obra.nome,v_custo,
    p_data_venda,p_data_venda,p_data_venda,null,'paid','Reclassificacao interna',
    'Lancamento automatico sem efeito de caixa: baixa do estoque para CPV.',
    auth.uid(),v_cpv,p_obra
  ) returning id into v_entry;

  insert into public.partidas(entry_id,conta_id,natureza,valor,memo) values
    (v_entry,v_cpv,'debito',v_custo,'venda da obra: reconhecimento do CPV'),
    (v_entry,v_obra.conta_estoque_id,'credito',v_custo,'venda da obra: baixa do estoque');

  update public.obras
     set status='vendida',data_venda=p_data_venda,cpv_entry_id=v_entry
   where id=p_obra;

  return query select v_entry,v_custo;
end;
$$;

revoke all on function public.finalizar_venda_obra(uuid,date) from public,anon;
grant execute on function public.finalizar_venda_obra(uuid,date) to authenticated;
