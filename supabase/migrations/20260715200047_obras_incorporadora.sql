-- obras_incorporadora — dimensão de obra + custo por obra (Fase 4 do roadmap DRE/Balanço)
-- ============================================================================================
-- STATUS: ✅ APLICADA em 2026-07-15 (version 20260715200047), aprovada pelo Luiz (SÓ a estrutura;
--   backfill de marcação ADIADO por decisão dele). Verificação adversarial de 4 agentes = 0 blockers.
--   Smoke pós-apply: 2 obras (Cristais/Alfenas em_andamento), entries.obra_id nullable, 0 marcados,
--   4 policies. DRE inalterada (migration puramente aditiva, não toca nenhum lançamento existente).
-- ============================================================================================
--
-- ESCOPO (Fase 4a — ESTRUTURA, não depende do Kaique):
--   Cria a dimensão `obras` (máquina de estado em_andamento→vendida) e liga os lançamentos a ela
--   (`entries.obra_id`), habilitando o "custo por obra" da aba Custo por Obra da planilha. Seed das
--   obras REAIS (Cristais, Alfenas — nomes que aparecem literalmente nas descrições; sem placeholders
--   Obra 3/4). A marcação dos lançamentos por obra (backfill) foi ADIADA — ver bloco (4) abaixo.
--
--   Dados reais (2026-07-15): 0 vendas na Incorporadora (ambas em_andamento). Custos de obra hoje
--   quase todos SEM conta (caem em "a classificar" na DRE) e espalhados entre Incorporadora (maioria)
--   e Digital (DARF ISS Cristais, água/luz Alfenas) — intercompany por obra, legítimo (a obra é da
--   Incorporadora; custos podem ser pagos por outra empresa do grupo). "Casa do Rafa" é pessoal do
--   Rafael (empresa RAFAEL BRITO) — NÃO é obra da Incorporadora, fica de fora (não casa cristais/alfenas).
--
-- O QUE **NÃO** FAZ (Fase 4b — depende do seed patrimonial da Fase 2, travada pelo Kaique):
--   • Não cria conta de ESTOQUE (custo de obra = ativo no Balanço até vender) — `obras.conta_estoque_id`
--     nasce NULL, será preenchida quando as contas patrimoniais existirem.
--   • Não implementa o evento de VENDA (reclassificação estoque→CPV) nem a DRE Incorporadora por obra.
--   • Não aplica a invariante do prompt "obra_id só em conta de estoque/custo de obra vendida" — hoje
--     obra_id é livre (dimensão); a constraint fina vem na 4b, com as contas de obra.
--   • Não muda NENHUM número da DRE: obra_id é coluna nova ignorada por todas as RPCs (dimensão pura).
--
-- ROLLBACK: drop column entries.obra_id + drop table obras (nesta ordem). Sem backfill = sem mutação
--   de linha; nada a reverter além da coluna/tabela.

-- 1) Tabela obras (dimensão + estado). company_id = empresa DONA da obra (Incorporadora).
create table public.obras (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete restrict,
  nome              text not null,
  status            text not null default 'em_andamento' check (status in ('em_andamento','vendida')),
  conta_estoque_id  uuid references public.chart_of_accounts(id) on delete set null,  -- Fase 4b
  data_venda        date,
  created_at        timestamptz not null default now(),
  unique (company_id, nome),
  constraint obras_venda_coerente check (
    (status = 'vendida'     and data_venda is not null) or
    (status = 'em_andamento' and data_venda is null)
  )
);

-- RLS: leitura de equipe, escrita de admin (padrão do projeto, espelha chart_of_accounts).
alter table public.obras enable row level security;
create policy obras_sel on public.obras for select to authenticated using (true);
create policy obras_ins on public.obras for insert to authenticated with check ((select public.is_admin()));
create policy obras_upd on public.obras for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy obras_del on public.obras for delete to authenticated using ((select public.is_admin()));
grant select, insert, update, delete on public.obras to authenticated, service_role;
create index idx_obras_company on public.obras (company_id);
create index idx_obras_conta_estoque on public.obras (conta_estoque_id) where conta_estoque_id is not null;

-- 2) entries.obra_id (dimensão; RESTRICT = não deixa apagar obra com custos lançados).
alter table public.entries add column obra_id uuid references public.obras(id) on delete restrict;
create index idx_entries_obra on public.entries (obra_id) where obra_id is not null;

-- 3) Seed das obras reais (Incorporadora, em_andamento).
insert into public.obras (company_id, nome) values
  ('7bd4e9e2-3d39-4f84-9534-50bf840abc6b', 'Cristais'),
  ('7bd4e9e2-3d39-4f84-9534-50bf840abc6b', 'Alfenas');

-- 4) Backfill (marcação dos ~135 lançamentos de obra) ADIADO por decisão do Luiz (2026-07-15):
--    a ESTRUTURA entra agora; a atribuição de obra_id aos lançamentos será revisada e feita
--    depois (na mão / via UI). Esta migration NÃO toca entries além de ADICIONAR a coluna obra_id
--    (nenhum UPDATE de linha) — por isso não precisa desabilitar trigger nenhum.
--    Referência do backfill futuro (inequívoco, 0 falsos positivos verificados): 135 lançamentos —
--    Cristais 61 (~R$130k, 54 Incorporadora + 7 Digital) · Alfenas 74 (~R$87k, 72 + 2) —
--    por `description ~* 'cristais'|'alfenas'` (o nome da obra está literal na descrição).
