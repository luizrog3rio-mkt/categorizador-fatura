# Roadmap — DRE + Balanço + Consolidada + Custo por Obra (3 empresas)

> Mapa do trabalho, com as decisões já tomadas com o Luiz. Origem: prompt "Financeiro RB7
> (escopo completo)" + planilha `RB7_Plano_de_Contas_DRE.xlsx` (spec) + inventário do vivo (F0).
> **Regra-mãe:** nenhuma migration encosta no banco sem o Luiz revisar o SQL e aprovar.

## Decisões tomadas (checkpoints F0)

1. **Núcleo contábil: caminho A (partida dobrada), FASEADO.** O POC provou (dado real, 3
   empresas, ano inteiro, **0 divergências**) que partidas reproduzem a DRE atual ao centavo —
   o risco de regressão está afastado. Chegamos ao Balanço fechado por fases, não big-bang.
2. **Plano de contas: ESTENDER, não recriar.** `chart_of_accounts` ganha `company_id` +
   `tipo` (resultado/patrimonial) + `redutora`. Modelo **compartilhado + específico**:
   `company_id NULL` = conta do grupo (as 102 vivas); preenchido = conta de uma empresa. O dado
   real justifica (uso cruzado é só em despesas genéricas).
3. **Avançar no que não depende do Kaique**; travar o resto até as respostas dele.

## Pendências externas (Kaique / Carteira 360º) — bloqueiam só o marcado

- [ ] Confirmar que **esta planilha "v2" é a aprovada** (pode haver v3) — trava o SEED definitivo.
- [ ] **Gabarito abr/mai/jun** (auditoria lançamento-a-lançamento) — alvo real do portão F5.
- [ ] **Equivalência patrimonial × dividendos** — trava a regra 1 da Consolidada.
- [ ] Decisão contábil do **`2.4.03 REEMBOLSO DE TRÁFEGO`** (nature=revenue sob Deduções).

## Fases

| Fase | Entrega | Depende do Kaique? | Estado |
|---|---|---|---|
| **1. Estrutura do plano por empresa** | `company_id`+`tipo`+`redutora` em `chart_of_accounts` | não | ✅ **APLICADA 2026-07-15** (`20260715173423`) |
| **2a. Balanço Digital** | 50 contas patrimoniais (Ativo/Passivo/PL) + filtro `tipo=resultado` na DRE + seletores de front | não | ✅ **APLICADA 2026-07-15** (`20260715215959`) |
| **2b/2c. Balanço Holding + Incorporadora** | contas patrimoniais + DRE Holding (receita de participações) + custo de obra | não | ⏳ próximo |
| **3. Saneamento de datas** | backfill + `issue_date`/`competency_date` NOT NULL (problema #3 da reunião) | não | ✅ **APLICADA 2026-07-15** (`20260715192144`) |
| **4a. Obras — estrutura** | tabela `obras` (em_andamento→vendida) + `entries.obra_id` + seed Cristais/Alfenas | não | ✅ **APLICADA 2026-07-15** (`20260715200047`) · marcação dos ~135 lançamentos adiada (a revisar) |
| **4b. Obras — estoque + venda** | conta de estoque (ativo) + evento de venda (reclassif. → CPV) + DRE Incorporadora por obra | **sim** (contas patrimoniais da Fase 2) | ⏳ |
| **5a. Motor de sugestão — banco** | tabela `regras_conta` + RPC `sugerir_contas` (read-only) + seed factual (IOF/Tarifa/Pedágio) | não | ✅ **APLICADA 2026-07-15** (`20260715202831`) · já sugere p/ 64 itens da Digital |
| **5b. Motor de sugestão — front** | tela `/classificar-despesas` (balde + sugestão + aplicar em massa) + CRUD de regras | não | 🔵 **construída (build+lint OK)** · pendente de teste logado + deploy |
| **6. Lado patrimonial (núcleo A)** | `lancamentos`+`partidas`, contrapartidas, Balanço fechado, portão F5 | parcial (gabarito) | ⏳ |
| **7. Consolidada** | intercompany + eliminações (regras 2/3/4 já dá; regra 1 espera equivalência) | **sim** (regra 1) | ⏳ |

Cada fase deixa o app **de pé** e entra como migration revisada + (quando houver) ajuste de front.
Nada de DROP do modelo antigo antes do portão F5 verde.

## Documentos

- [01-depara-plano-de-contas.md](01-depara-plano-de-contas.md) — planilha × 102 contas vivas.
- [02-spike-nucleo-contabil.md](02-spike-nucleo-contabil.md) — A × B + resultado do POC (0 diff).
- Migration da fase 1: `supabase/migrations/20260715120000_plano_contas_por_empresa.sql` (⏳ não aplicada).
