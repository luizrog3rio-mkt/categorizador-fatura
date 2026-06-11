-- ============================================================================
-- Fase 3 — correções de qualidade de dados (mínimas; dados já estavam limpos)
-- ============================================================================
-- APLICADA em 2026-06-10 (version vivo 20260611002326). Verificada: valor =
-- 1163.98, regra captions.ai = Ferramenta.
-- O diagnóstico (2026-06-10) mostrou os dados íntegros: zero órfãos de
-- categoria-texto, zero duplicata de auto_rules, totais das faturas batendo,
-- valores/datas/memos sãos. Só 2 fixes pontuais; ambos com guarda (where inclui
-- o valor atual → idempotente). DECISÃO: NÃO converter categoria texto→FK (dado
-- já íntegro, app funciona com texto) e NÃO fazer a Fase 4 (migrar transactions
-- → bank_transactions violaria o UNIQUE(account_id,fit_id) por causa dos
-- parcelamentos Sicoob; cartão e extrato seguem como fluxos separados).
-- ============================================================================

do $$
declare
  n integer;
begin
  -- Fix 1: valor digitado errado (decimal deslocado)
  -- "Mercado Livre - 2 monitor e 2 cabos": 1.16398 → 1163.98
  update public.purchase_items
  set amount = 1163.98
  where id = '0711731f-650f-4878-8c69-c99b30732e57' and amount = 1.16398;
  get diagnostics n = row_count;
  if n > 1 then
    raise exception 'Fase 3 abortada: fix de valor atingiu % linha(s), esperado 0 ou 1', n;
  end if;

  -- Fix 2: regra captions.ai é Ferramenta, não Viagem (corrige imports futuros;
  -- as 3 transações existentes já estavam como Ferramenta)
  update public.auto_rules
  set category = 'Ferramenta'
  where 'captions.ai' = any(keywords) and category = 'Viagem';
  get diagnostics n = row_count;
  if n > 1 then
    raise exception 'Fase 3 abortada: fix da regra atingiu % linha(s), esperado 0 ou 1', n;
  end if;
end $$;
