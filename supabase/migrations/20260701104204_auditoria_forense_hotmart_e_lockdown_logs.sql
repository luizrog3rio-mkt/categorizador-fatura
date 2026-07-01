-- APLICADA: 20260701104204
-- Auditoria de 11 frentes (2026-07-01), achados P1 + P5 (ambos verificados, severidade low/info):
-- P1: hotmart_sales (100% da receita, ~15k linhas) NAO tinha trigger de DELETE -> um admin podia
--   apagar a fonte da verdade da receita via PostgREST SEM rastro em deletions_log nem snapshot
--   recuperavel (o sync so varre ~1 mes; venda antiga deletada nao volta). Fix: trigger BEFORE DELETE
--   -> log_delecao() (funcao ja generica: tg_table_name + old.id + to_jsonb(old); hotmart_sales tem id).
--   Idem bank_transactions (0 linhas hoje, custo zero, fecha a lacuna preventivamente).
-- P5: a imutabilidade de deletions_log / entry_audit_log dependia SO da RLS (deny-by-default) — mas
--   authenticated tinha grant INSERT/UPDATE/DELETE (default app-wide do Supabase). Se alguem adicionar
--   uma policy ampla ou desligar RLS, a equipe ganharia escrita na trilha forense. Fix: REVOKE. A
--   gravacao legitima e via trigger SECURITY DEFINER (roda como owner, independe do grant do caller);
--   SELECT fica (a tela /delecoes le via listar_delecoes).

create trigger trg_log_delecao_hotmart_sales before delete on public.hotmart_sales
  for each row execute function public.log_delecao();

create trigger trg_log_delecao_bank_transactions before delete on public.bank_transactions
  for each row execute function public.log_delecao();

revoke insert, update, delete, truncate on public.deletions_log from authenticated;
revoke insert, update, delete, truncate on public.entry_audit_log from authenticated;
