-- saneamento_datas_entries — emissão e competência obrigatórias (Fase 3 do roadmap DRE/Balanço)
-- ============================================================================================
-- STATUS: ✅ APLICADA em 2026-07-15 (version 20260715192144), aprovada pelo Luiz.
--   Verificação adversarial de 4 agentes (mecânica, neutralidade DRE, app-de-pé, trigger) = 0 blockers.
--   Checagem pré-apply: risco_335 = 0 (nenhum both-null classificado). Smoke pós-apply: comp_null 775→0,
--   issue_null 344→0, ambas NOT NULL, trigger criado, 5 triggers habilitados, e DRE idêntica à baseline
--   (Digital 7.731.738,99 / Incorp 341.222,35 / Part 7.129,30 / DRE-produto 6.368.271,73 — diff R$0,00).
-- ============================================================================================
--
-- PROBLEMA (item #3 da reunião Carteira 360º): "um campo de data fazendo dois trabalhos"
--   (pró-labore pago em 05/06 lançado como 30/06). Hoje `due_date` é a única NOT NULL; há
--   344 entries sem `issue_date` e 775 sem `competency_date`. O form manual JÁ exige as duas
--   (required + validação), mas 3 caminhos criam entries sem elas: import CSV, recorrência
--   (`inserirProximoMes`) e transferência.
--
-- O QUE FAZ (em ordem):
--   1) BACKFILL neutro p/ a DRE. `competency_date = coalesce(competency,issue,due)` é EXATAMENTE
--      o que `dre_by_competency` já usa no coalesce → nenhum número muda (verificado). `issue_date`
--      recebe `coalesce(issue,competency,due)` (proxy; emissão não entra em soma de dinheiro).
--      Roda com audit + bloqueio-de-período + updated_at DESABILITADOS: é correção sistêmica
--      (não edição de negócio), não muda período efetivo (o bloqueio usa o mesmo coalesce),
--      evita ~1.100 linhas de ruído no forense e preserva o `updated_at` real dos históricos.
--      Há 0 períodos fechados hoje.
--   ⚠️ PRÉ-CONDIÇÃO (checar IMEDIATAMENTE antes do apply): os 335 entries com competency E issue
--      ambos nulos são hoje 100% NÃO-classificados (chart null) → o backfill é inerte na
--      dre_by_product/dre_cash_reconciliation (INNER JOIN em conta). Se alguém classificar um
--      deles antes do apply, aquela DRE mudaria. Rodar:
--        select count(*) from public.entries
--        where competency_date is null and issue_date is null and chart_of_account_id is not null;
--      Deve ser 0. Se >0, reavaliar antes de aplicar.
--   2) TRIGGER de garantia `trg_entries_preenche_datas` (BEFORE INSERT/UPDATE): preenche as duas
--      datas via o mesmo coalesce. Torna o NOT NULL à prova de TODOS os caminhos (form, import,
--      recorrência, transferência, edge/service) SEM depender do front → app segue de pé sem
--      mudar código. Ordem vs. o bloqueio é indiferente (ambos usam o mesmo coalesce c/ due_date).
--   3) NOT NULL em `competency_date` e `issue_date` (histórico preenchido + trigger cobre o futuro).
--
-- O QUE NÃO FAZ:
--   • Não muda o front (o trigger torna o ajuste de código desnecessário p/ o app não quebrar).
--     Melhoria de qualidade futura (opcional): o import CSV ganhar coluna de competência própria.
--   • Não simplifica a RPC (o coalesce vira redundante mas inócuo — mexer nela agora só adiciona
--     risco). Follow-up opcional.
--   • Não mexe no CHECK `entries_datas_sanas` (o "IS NULL OR ..." fica inócuo, compatível).
--
-- INVARIANTE PRESERVADA: nenhum valor de dinheiro muda; a DRE das 3 empresas fica idêntica
--   (o backfill materializa o coalesce que já era usado). Provado por diff pré/pós no smoke.
--
-- ROLLBACK: alter column drop not null (as 2) + drop trigger trg_entries_preenche_datas +
--   drop function entries_preenche_datas. O backfill NÃO é revertido (são proxies válidos e a
--   DRE não mudou); se preciso, os valores originais estão no histórico de backup diário.

-- 1) BACKFILL — correção sistêmica, sem tocar nada além das datas. Desabilita nesta janela:
--    audit (não poluir o forense), bloqueio de período (não é edição de negócio; 0 fechados) e
--    updated_at (preservar o "última modificação" real dos ~1.119 registros históricos).
alter table public.entries disable trigger entry_audit_log_tg;
alter table public.entries disable trigger trg_bloqueia_periodo_fechado;
alter table public.entries disable trigger trg_entries_updated_at;

update public.entries
  set competency_date = coalesce(competency_date, issue_date, due_date)
  where competency_date is null;   -- 775: mesmo valor que a DRE já resolvia no coalesce

update public.entries
  set issue_date = coalesce(issue_date, competency_date, due_date)
  where issue_date is null;        -- 344: proxy de emissão (não entra em soma)

alter table public.entries enable trigger trg_entries_updated_at;
alter table public.entries enable trigger trg_bloqueia_periodo_fechado;
alter table public.entries enable trigger entry_audit_log_tg;

-- 2) TRIGGER de garantia: as duas datas nunca nascem nulas, em nenhum caminho de escrita.
create or replace function public.entries_preenche_datas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- competência nunca nula: cai p/ emissão e, por fim, vencimento (sempre presente).
  new.competency_date := coalesce(new.competency_date, new.issue_date, new.due_date);
  -- emissão nunca nula: proxy = competência (agora preenchida) ou vencimento.
  new.issue_date      := coalesce(new.issue_date, new.competency_date, new.due_date);
  return new;
end;
$$;

drop trigger if exists trg_entries_preenche_datas on public.entries;
create trigger trg_entries_preenche_datas
  before insert or update on public.entries
  for each row execute function public.entries_preenche_datas();

-- 3) NOT NULL (histórico preenchido no passo 1; futuro coberto pelo trigger do passo 2).
alter table public.entries alter column competency_date set not null;
alter table public.entries alter column issue_date      set not null;
