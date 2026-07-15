-- plano_contas_por_empresa — ESTRUTURA para 3 empresas + Balanço (Fase 1 do roadmap DRE/Balanço)
-- ============================================================================================
-- STATUS: ✅ APLICADA em 2026-07-15 (version 20260715173423), aprovada pelo Luiz.
--   Verificação adversarial de 4 agentes (SQL/catálogo, DRE/RPCs, frontend, RLS) = 0 blockers.
--   Smoke pós-apply: 102 contas intactas (todas resultado/compartilhada/não-redutora), 3 constraints
--   novas + UNIQUE(code) antigo removido, prova de equivalência partidas↔DRE = 0 diff. Um delta
--   observado na DRE (jun) foi rastreado ao entry_audit_log = edições de competency_date por usuário
--   ANTES do apply (17:18–17:30 < 17:34) — migration inocente, invariante "valor não muda" preservada.
-- ============================================================================================
--
-- O QUE FAZ (aditivo, não-destrutivo; as 102 contas vivas ficam byte-a-byte inalteradas):
--   Adiciona a `chart_of_accounts` as 3 dimensões que faltam para suportar 3 empresas + Balanço,
--   SEM recriar o plano e SEM re-apontar nenhum lançamento.
--
--   • company_id (nullable) — NULL = conta COMPARTILHADA por todas as empresas do grupo;
--     preenchido = conta ESPECÍFICA daquela empresa.
--     Justificativa (dado real 2026-07-15): todo o uso cruzado hoje é em contas genéricas
--     (despesas 6.x, financeiras 8.2, receita 1.8) — Incorporadora/Participações/Rafael/Molho
--     NUNCA usam as contas de receita-de-produto da Digital. Manter as 102 como compartilhadas
--     (NULL) preserva 955+ classificações e evita re-apontar os 42 entries não-Digital. As
--     contas ESPECÍFICAS (Balanço Digital, obras da Incorporadora, plano da Holding) nascem
--     com company_id preenchido nas migrations de SEED (próximas fases).
--   • tipo ('resultado'|'patrimonial') — discrimina DRE de Balanço. Resolve a COLISÃO de código
--     (na DRE '1'=Receita; no Balanço '1'=Ativo) sem inventar prefixo: entra no unique.
--   • redutora (bool) — p/ depreciação/amortização acumuladas (contas patrimoniais do seed futuro).
--
--   Também amplia o CHECK de `nature` (asset/liability/equity, p/ o Balanço) e troca o
--   UNIQUE(code) por UNIQUE(company_id, tipo, code) NULLS NOT DISTINCT (exige PG15+; banco é 17.6).
--
-- O QUE **NÃO** FAZ (de propósito — fica p/ as próximas fases):
--   • Não cria nenhuma conta patrimonial / de obra / de holding (isso é SEED, próxima migration).
--   • Não atribui company_id a nenhuma conta (todas seguem compartilhadas). A atribuição fina das
--     receitas específicas da Digital é refino posterior, com decisão.
--   • Não altera dre_by_competency / dre_by_product (as 102 seguem 'resultado'/compartilhadas; a
--     RPC junta por id de conta). Quando o seed patrimonial entrar, a listagem final da RPC ganha
--     filtro tipo='resultado' p/ não mostrar linhas patrimoniais zeradas — follow-up anotado.
--   • Não toca RLS/grants (as policies is_admin + SELECT-equipe cobrem as colunas novas).
--
-- ⚠️ INVARIANTE FLEXIBILIZADA (decisão a RATIFICAR): a regra do prompt "conta pertence à mesma
--   empresa do lançamento" passa a ser "conta COMPARTILHADA (company_id null) OU da mesma empresa".
--   É o desvio consciente que o inventário exige (despesas de estrutura são do grupo). Difere do
--   schema-alvo do prompt (que previa empresa_id NOT NULL + UNIQUE(empresa_id, codigo)).
--
-- ROLLBACK: drop das 3 colunas + das 3 constraints novas + restaurar UNIQUE(code) + re-add do
--   nature_check antigo (7 valores). Sem perda (nada foi seedado/mutado). Ao fim, recarregar o
--   schema cache do PostgREST (as colunas novas).

-- (Transação: gerenciada pelo apply_migration — sem begin/commit explícito, padrão do projeto.)

-- 1) Dimensões novas. Defaults preservam as 102 contas: resultado, compartilhada, não-redutora.
alter table public.chart_of_accounts
  add column if not exists company_id uuid references public.companies(id) on delete restrict,
  add column if not exists tipo       text    not null default 'resultado',
  add column if not exists redutora   boolean not null default false;

-- 2) tipo restrito a resultado|patrimonial.
alter table public.chart_of_accounts
  add constraint chart_of_accounts_tipo_check
  check (tipo in ('resultado','patrimonial'));

-- 3) nature ampliado p/ contas patrimoniais (nenhuma criada agora; só habilita o seed futuro).
alter table public.chart_of_accounts drop constraint chart_of_accounts_nature_check;
alter table public.chart_of_accounts
  add constraint chart_of_accounts_nature_check
  check (nature in (
    'revenue','deduction','variable_cost','fixed_cost','financial','depreciation','tax', -- resultado
    'asset','liability','equity'                                                          -- patrimonial
  ));

-- 4) Coerência tipo × nature (resultado só com nature de resultado; patrimonial só com patrimonial).
alter table public.chart_of_accounts
  add constraint chart_of_accounts_tipo_nature_check
  check (
    (tipo = 'resultado'    and nature in ('revenue','deduction','variable_cost','fixed_cost','financial','depreciation','tax'))
    or (tipo = 'patrimonial' and nature in ('asset','liability','equity'))
  );

-- 5) Unicidade por escopo: (empresa, tipo, código). NULLS NOT DISTINCT faz as compartilhadas
--    (company_id null) colidirem entre si => no máx 1 conta compartilhada por (tipo, code), e
--    cada empresa pode ter a sua. Substitui o UNIQUE(code) global.
alter table public.chart_of_accounts drop constraint chart_of_accounts_code_key;
alter table public.chart_of_accounts
  add constraint chart_of_accounts_scope_code_key
  unique nulls not distinct (company_id, tipo, code);

-- 6) Índice de escopo (consultas por empresa filtram company_id).
create index if not exists idx_coa_company
  on public.chart_of_accounts (company_id) where company_id is not null;

-- Pós-apply: o event trigger de DDL do Supabase recarrega o schema cache do PostgREST.
-- Se as colunas novas demorarem a aparecer na API: notify pgrst, 'reload schema';
