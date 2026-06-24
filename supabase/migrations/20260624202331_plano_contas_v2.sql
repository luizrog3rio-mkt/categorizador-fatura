-- ============================================================================
-- Plano de Contas DRE v2 (modelo do contador) — substitui o plano anterior
-- ============================================================================
-- APLICADA em 2026-06-24 — version 20260624202331. Verificado pós-apply: 82 contas
-- (63 analíticas / 19 grupos / 7 raízes); os 18 lançamentos foram re-classificados
-- pras contas novas (de-para do passo 6) sem perda. DRE/RPC inalteradas (nature-based).
--
-- O contador refez o plano de contas gerencial (RB7_Plano_de_Contas_DRE_v2.xlsx).
-- Reestruturação grande: numeração nova e mais detalhada (~81 contas vs 46).
--   1 Receita Bruta → 2 Deduções → 4 Custos Variáveis → 6 Despesas Fixas →
--   8 Resultado Financeiro → 9 Depreciação → 11 IRPJ/CSLL.
--
-- Naturezas mapeiam 1:1 no enum atual (sem mudar schema): Receita Bruta=revenue,
-- Dedução=deduction, Custo Variável=variable_cost, Despesa Fixa=fixed_cost,
-- Resultado Financeiro=financial, Depreciação=depreciation, Imposto=tax. A tela
-- DRE e a RPC dre_by_competency são baseadas em `nature` → funcionam sem alteração.
--
-- EXCLUÍDO do plano (não são contas lançáveis): linhas de subtotal/resultado
-- (3 Receita Líquida, 5 Margem, 7 EBITDA, 10 LAIR, 12 Lucro — a DRE calcula),
-- itens de Balanço (B.1 Consórcio, B.2 Imobilizado) e os 3 placeholders de curso
-- (1.2.01-03 "Curso — (preencher nome)" — o Luiz preenche depois na tela).
--
-- 18 lançamentos já estavam classificados em 7 contas; remapeados pro v2 (passo 6)
-- pra NÃO perder a classificação:
--   3.2.03 Internet/Telefone        → 6.3.02 Utilidades (energia/água/internet)
--   3.1.01 Salários e Encargos      → 6.1.01 Salários e Ordenados
--   1.2.03 Taxas de Adquirência     → 2.3.01 Taxa de Cartão de Crédito
--   1.1.02 Apruma                   → 1.1.02 Mentoria em Grupo — Apruma
--   1.2.01 Impostos sobre Vendas    → 2.1.01 ISS
--   3.2.01 Aluguel                  → 6.3.01 Aluguel / Condomínio
--   3.4.01 Contabilidade/Jurídico   → 6.3.03 Contabilidade / Honorários
-- ============================================================================

-- 1) captura, ANTES de apagar, o código antigo de cada lançamento classificado
create temp table _classif on commit drop as
  select e.id as entry_id, c.code as old_code
  from public.entries e
  join public.chart_of_accounts c on c.id = e.chart_of_account_id;

-- 2) de-para das contas em uso (código antigo → código novo)
create temp table _map (old_code text, new_code text) on commit drop;
insert into _map values
  ('3.2.03', '6.3.02'),
  ('3.1.01', '6.1.01'),
  ('1.2.03', '2.3.01'),
  ('1.1.02', '1.1.02'),
  ('1.2.01', '2.1.01'),
  ('3.2.01', '6.3.01'),
  ('3.4.01', '6.3.03');

-- 3) zera referências e remove o plano antigo
--    (entries.chart_of_account_id é SET NULL; parent_id é RESTRICT → zera antes)
update public.entries set chart_of_account_id = null where chart_of_account_id is not null;
update public.chart_of_accounts set parent_id = null;
delete from public.chart_of_accounts;

-- 4) insere o plano v2 (só code/name/nature; o resto é derivado nos passos 5)
insert into public.chart_of_accounts (code, name, nature) values
  -- ── 1 RECEITA BRUTA (revenue) ──
  ('1',      'RECEITA BRUTA DE VENDAS',              'revenue'),
  ('1.1',    'Mentorias',                            'revenue'),
  ('1.1.01', 'Mentoria Individual / High Ticket',    'revenue'),
  ('1.1.02', 'Mentoria em Grupo — Apruma',           'revenue'),
  ('1.1.03', 'Mentoria em Grupo — Trampolim',        'revenue'),
  ('1.1.04', 'Mentoria em Grupo — Colheita',         'revenue'),
  ('1.2',    'Cursos Online',                        'revenue'),
  ('1.2.04', 'Order Bump / Upsell / Downsell',       'revenue'),
  ('1.3',    'Ebooks',                               'revenue'),
  ('1.4',    'Livros Físicos',                       'revenue'),
  ('1.5',    'Recorrência / Assinatura',             'revenue'),
  ('1.6',    'Palestras',                            'revenue'),
  ('1.7',    'Publicidade',                          'revenue'),
  ('1.8',    'Outras Receitas',                      'revenue'),
  -- ── 2 DEDUÇÕES (deduction) ──
  ('2',      'DEDUÇÕES DA RECEITA',                  'deduction'),
  ('2.1',    'Impostos sobre Vendas',                'deduction'),
  ('2.1.01', 'ISS',                                  'deduction'),
  ('2.1.02', 'ICMS',                                 'deduction'),
  ('2.1.03', 'PIS / COFINS',                         'deduction'),
  ('2.2',    'Taxas de Plataforma',                  'deduction'),
  ('2.2.01', 'Hotmart',                              'deduction'),
  ('2.2.02', 'TMB',                                  'deduction'),
  ('2.3',    'Taxas de Adquirência / Gateway',       'deduction'),
  ('2.3.01', 'Taxa de Cartão de Crédito',            'deduction'),
  ('2.3.02', 'Taxa de Pix / Boleto',                 'deduction'),
  ('2.4',    'Reembolsos e Estornos',                'deduction'),
  ('2.4.01', 'Reembolso — Mentorias',                'deduction'),
  ('2.4.02', 'Reembolso — Cursos',                   'deduction'),
  ('2.5',    'Chargebacks',                          'deduction'),
  -- ── 4 CUSTOS VARIÁVEIS (variable_cost) ──
  ('4',      'CUSTOS VARIÁVEIS (CPV)',               'variable_cost'),
  ('4.1',    'Tráfego de Venda Direta',              'variable_cost'),
  ('4.1.01', 'Meta Ads (Facebook / Instagram)',      'variable_cost'),
  ('4.1.02', 'Google / YouTube Ads',                 'variable_cost'),
  ('4.1.03', 'TikTok Ads',                           'variable_cost'),
  ('4.1.04', 'Outras Mídias',                        'variable_cost'),
  ('4.2',    'Comissões',                            'variable_cost'),
  ('4.2.01', 'Comissão de Afiliados',                'variable_cost'),
  ('4.2.02', 'Comissão de Co-produção',              'variable_cost'),
  ('4.2.03', 'Comissão de Closers / Vendas',         'variable_cost'),
  ('4.2.04', 'Comissão de SDR / Pré-venda',          'variable_cost'),
  ('4.3',    'Custo de Produtos Físicos',            'variable_cost'),
  ('4.3.01', 'Impressão / Produção Gráfica',         'variable_cost'),
  ('4.3.02', 'Frete e Logística',                    'variable_cost'),
  ('4.3.03', 'Embalagem',                            'variable_cost'),
  ('4.3.04', 'Armazenagem / Fulfillment',            'variable_cost'),
  ('4.4',    'Custos de Entrega / Operação',         'variable_cost'),
  ('4.4.01', 'Impressão de Apostilas',               'variable_cost'),
  ('4.4.02', 'Cachê / Mentores Convidados',          'variable_cost'),
  ('4.4.03', 'Hospedagem de Conteúdo (rateio)',      'variable_cost'),
  ('4.4.04', 'Certificados / Materiais do Aluno',    'variable_cost'),
  ('4.5',    'Ferramentas Variáveis',                'variable_cost'),
  -- ── 6 DESPESAS FIXAS (fixed_cost) ──
  ('6',      'DESPESAS OPERACIONAIS FIXAS',          'fixed_cost'),
  ('6.1',    'Despesas com Pessoal',                 'fixed_cost'),
  ('6.1.01', 'Salários e Ordenados',                 'fixed_cost'),
  ('6.1.02', 'Encargos (INSS / FGTS)',               'fixed_cost'),
  ('6.1.03', 'Benefícios (VR / VA / VT / Saúde)',    'fixed_cost'),
  ('6.1.04', 'Pró-labore dos Sócios',                'fixed_cost'),
  ('6.1.05', 'PJs / Prestadores Fixos',              'fixed_cost'),
  ('6.2',    'Despesas de Marketing (fixas)',        'fixed_cost'),
  ('6.2.01', 'Tráfego de Alcance / Institucional',   'fixed_cost'),
  ('6.2.02', 'Equipe / Agência de Marketing',        'fixed_cost'),
  ('6.2.03', 'Produção de Conteúdo (estúdio/edição)','fixed_cost'),
  ('6.2.04', 'Ferramentas de Marketing (CRM/e-mail)','fixed_cost'),
  ('6.2.05', 'Permutas / Influência (fixa)',         'fixed_cost'),
  ('6.3',    'Despesas Administrativas',             'fixed_cost'),
  ('6.3.01', 'Aluguel / Condomínio',                 'fixed_cost'),
  ('6.3.02', 'Utilidades (energia/água/internet)',   'fixed_cost'),
  ('6.3.03', 'Contabilidade / Honorários',           'fixed_cost'),
  ('6.3.04', 'Jurídico',                             'fixed_cost'),
  ('6.3.05', 'Material de Escritório / Gerais',      'fixed_cost'),
  ('6.3.06', 'Viagens e Deslocamentos',              'fixed_cost'),
  ('6.4',    'Despesas de Tecnologia / Infra',       'fixed_cost'),
  ('6.4.01', 'Hospedagem / Servidores / Domínios',   'fixed_cost'),
  ('6.4.02', 'Softwares e SaaS (fixos)',             'fixed_cost'),
  ('6.4.03', 'Suporte / TI',                         'fixed_cost'),
  -- ── 8 RESULTADO FINANCEIRO (financial) ──
  ('8',      'RESULTADO FINANCEIRO',                 'financial'),
  ('8.1',    'Receitas Financeiras',                 'financial'),
  ('8.2',    'Despesas Financeiras',                 'financial'),
  ('8.3',    'Antecipação de Recebíveis',            'financial'),
  ('8.4',    'Taxa de Administração de Consórcio',   'financial'),
  -- ── 9 DEPRECIAÇÃO (depreciation) ──
  ('9',      'Depreciação e Amortização',            'depreciation'),
  -- ── 11 IMPOSTO SOBRE LUCRO (tax) ──
  ('11',     'IRPJ e CSLL',                          'tax');

-- 5) deriva parent_id, sort_order e is_analytical a partir do código
--    parent = código sem o último segmento (1.1.01 → 1.1; 1.1 → 1; 9/11 → sem pai)
update public.chart_of_accounts child
set parent_id = parent.id
from public.chart_of_accounts parent
where strpos(child.code, '.') > 0
  and parent.code = left(child.code, length(child.code) - strpos(reverse(child.code), '.'));

--    sort_order numérico (3 dígitos por segmento) p/ ordenar dentro da natureza
update public.chart_of_accounts
set sort_order = split_part(code, '.', 1)::int * 1000000
  + coalesce(nullif(split_part(code, '.', 2), '')::int, 0) * 1000
  + coalesce(nullif(split_part(code, '.', 3), '')::int, 0);

--    is_analytical = false nas contas que têm filhas (grupos); true nas folhas
update public.chart_of_accounts g set is_analytical = false
where exists (select 1 from public.chart_of_accounts c where c.parent_id = g.id);

-- 6) re-classifica os 18 lançamentos (código antigo → de-para → conta nova)
update public.entries e
set chart_of_account_id = nc.id
from _classif cl
join _map m on m.old_code = cl.old_code
join public.chart_of_accounts nc on nc.code = m.new_code
where e.id = cl.entry_id;
