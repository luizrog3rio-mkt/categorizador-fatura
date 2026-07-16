-- partidas_backfill — o histórico entra no razão (Fase 6c)
-- ============================================================================================
-- STATUS: ✅ APLICADA em 2026-07-16 (version 20260716143345), aprovada pelo Luiz.
--   Smoke: 1.200 partidas / 600 lançamentos no razão; DÉBITO = CRÉDITO = R$1.812.145,51;
--   0 lançamentos desbalanceados. DRE não mudou por causa deste backfill (nenhuma RPC lê partidas).
-- ============================================================================================
--
-- O QUE FAZ: gera 2 partidas (débito + crédito) para cada lançamento que tem TODOS os elementos
--   da partida dobrada definidos. Regra (a mesma que o POC validou):
--     • despesa/custo paga  → D conta de resultado  / C conta de caixa (ou cartão a pagar)
--     • receita recebida    → D conta de caixa      / C conta de receita
--   Valor = `amount` (valor de face). O par fecha por construção → a constraint deferred aprova.
--
-- ESCOPO (deliberadamente conservador — "não invente"): só entra quem tem
--     chart_of_account_id (conta de RESULTADO)  +  payment_date  +  account_id com conta contábil,
--   e não é perna de transferência. Dry-run: 600 lançamentos → 1.200 partidas (R$1.812.145,51)
--   — Digital 551 despesas + 16 receitas, Incorporadora 28, Participações 5.
--
-- FICA DE FORA (o gap, por falta de dado — NÃO por limitação técnica):
--   • ~300 lançamentos PAGOS sem `account_id` (~R$1,4M): não há como saber de qual caixa saiu.
--   • ~330 sem conta de resultado (o balde "a classificar" — a tela /classificar-despesas ataca isso).
--   • os `receivable` em aberto (361) e `payable` em aberto: precisam das contas de contrapartida
--     "Fornecedores a pagar"/"Contas a receber" mapeadas por empresa (a Holding nem tem "fornecedores").
--   Esses lançamentos ficam SEM partidas — o que é válido (0 débito = 0 crédito passa na constraint)
--   e visível. À medida que ganharem conta/banco, entram no razão.
--
-- ⚠️ O QUE ISTO **NÃO** É: ainda não é o Balanço patrimonial completo. Faltam os SALDOS DE ABERTURA
--   (Capital Social, imobilizado existente, caixa inicial) — dado do CONTADOR, que não existe no
--   sistema. Sem eles o razão mostra a MOVIMENTAÇÃO do período, não a posição patrimonial.
--   Juros/multa/desconto também ficam fora do par (só o valor de face) — refino posterior.
--
-- NEUTRO PARA A DRE: nenhuma RPC de DRE lê `partidas`. As duas visões convivem até o portão F5.
-- IDEMPOTENTE: o `not exists` impede duplicar se rodar de novo.
-- ROLLBACK: delete from public.partidas where memo = 'backfill Fase 6c';

insert into public.partidas (entry_id, conta_id, natureza, valor, memo)
select e.id, v.conta, v.nat, e.amount, 'backfill Fase 6c'
from public.entries e
join public.chart_of_accounts c on c.id = e.chart_of_account_id
join public.accounts a on a.id = e.account_id
cross join lateral (values
  -- lado do RESULTADO: receita credita; dedução/custo/despesa/financeiro/depreciação/imposto debita
  (e.chart_of_account_id, case when c.nature = 'revenue' then 'credito' else 'debito' end),
  -- CONTRAPARTIDA patrimonial: o oposto, na conta de caixa (ou cartão a pagar) do banco usado
  (a.conta_contabil_id,   case when c.nature = 'revenue' then 'debito'  else 'credito' end)
) as v(conta, nat)
where e.status not in ('cancelled','refunded')
  and e.payment_date is not null
  and a.conta_contabil_id is not null
  and e.transfer_id is null
  and c.tipo = 'resultado'
  and not exists (select 1 from public.partidas p where p.entry_id = e.id);
