# Spike — Núcleo contábil: partida dobrada (prompt) × extensão do modelo simples (vivo)

> Insumo de decisão (F0). **Análise read-only + inspeção da DRE viva; nada aplicado, nada
> tocado em produção.** Responde: qual o esforço/risco REAL de bater o "portão F5" (a DRE
> nova ter que bater número-a-número com a DRE atual da Digital em abr/mai/jun) por cada
> caminho.

## 1. Como a DRE viva REALMENTE funciona (o achado que define tudo)

Inspecionei o corpo de `dre_by_competency`. Três fatos mudam o custo dos dois caminhos:

1. **É "meia-partida".** `entries.amount` é sempre **positivo**; o sinal contábil vem da
   combinação **`nature da conta × type do lançamento`** — `(revenue|deduction)+receivable`
   soma como entrada; `(variable_cost|fixed_cost|financial|depreciation|tax)+payable` soma
   como saída. **Não existe contrapartida de caixa** na DRE. É exatamente o lado que a
   partida dobrada adicionaria — e é o que habilita Balanço.

2. **A DRE lê TRÊS fontes, não uma.** O prompt assume que tudo é `lancamentos`. Falso:
   - `entries` (contas a pagar/receber) — competência = `coalesce(competency, issue, due)`.
   - `transactions` (linhas de fatura de **cartão**, classificadas) — competência = data da compra. **Não são entries.**
   - `hotmart_sales` (~13k) — entram **como linhas sintéticas**, não como lançamentos.

3. **Cinco linhas sintéticas** que qualquer modelo novo tem que preservar para o F5 bater:
   `HOT-1/2/3` (receita não-mapeada / taxa / comissões Hotmart) e `NC-1/2`
   (receitas/despesas **a classificar** = o balde). Elas **fazem parte da "DRE atual"** que
   o F5 tem que reproduzir.

**Retrato real — Digital, abr–jun/2026 (a "DRE atual" do portão F5):**

| Linha | R$ | Origem |
|---|---:|---|
| Receita (contas) | 1.320.410 | entries + Hotmart mapeado |
| Despesa fixa | 764.053 | entries + cartão |
| **NC-2 (Despesas a classificar)** | **341.977** | entries/cartão SEM conta |
| Custo variável | 163.953 | entries + cartão |
| Impostos | 100.379 | entries |
| HOT-2 taxa Hotmart | 91.643 | sintético |
| HOT-3 comissões Hotmart | 64.034 | sintético |
| Financeiro | 20.472 | entries |
| HOT-1 / NC-1 / Deduções-contas / Depreciação | 0 | — |

> O balde a classificar (R$ 342 k em 3 meses; R$ 1,26 M em `entries` + R$ 184 k em cartão
> acumulado) é **maior do que os R$ 177 k da reunião** — provavelmente a reunião viu um
> recorte. Esvaziá-lo é trabalho de classificação humana (não bloqueia nenhum caminho).

## 2. Caminho A — Partida dobrada plena (o que o prompt especifica)

**Schema:** `lancamentos` + `partidas` (1:N, débito/crédito) ao lado de `entries`.

**Reprodução da DRE viva (verificado por inspeção da RPC, viável e determinístico p/ `entries`):**
cada `entry` → 1 lançamento com 2 partidas — uma de **resultado** (conta =
`chart_of_account_id`, valor = `amount`, D se despesa/custo, C se receita → reproduz `mov`
exato) + uma **patrimonial** (caixa se pago, "a pagar/receber" se pendente → o lado NOVO).
`entry` sem conta → partida numa conta "(a classificar)" → reproduz `NC-1/NC-2`.

**A aresta que o prompt não previu:** partidas "ao lado de entries com backfill 2 partidas"
(F2) cobre **só `entries`**. Cartão e Hotmart são outras duas fontes. Para o F5 bater, ou:
- **A1** — unificar cartão+Hotmart também em `lancamentos+partidas`: máximo poder, mas
  **reescreve o ingest de cartão e a lógica sintética de Hotmart** → esbarra em "não mexer
  na Hotmart além do mapeamento". Risco alto.
- **A2** — partidas só para `entries`; cartão/Hotmart seguem como hoje e a DRE faz UNION
  (como a RPC já faz). Menos disruptivo, mas o **Balanço fica parcial** (cartão/Hotmart não
  geram contrapartida patrimonial).

**O que A DESTRAVA (e só ele entrega):** Balanço fechado (partidas patrimoniais somam
Ativo/Passivo/PL, `3.4` recebe a DRE), **consórcio 1 débito → 3 partidas** (D taxa/DRE, D
consórcio/ativo, C caixa), **obra-estoque real** (D estoque/ativo → na venda D CPV/DRE, C
estoque), Consolidada com eliminações amarradas.

**Esforço/risco:** **alto.** Reescreve o núcleo + duplica as 4 RPCs de DRE + o form de
lançamento (vira multi-partida) + o ingest. Portão F5 tem que bater **3 DREs vivas** (que
incluem R$ 342 k de a-classificar + cartão + Hotmart sintético) contra o modelo novo, em
produção real. Ordem: semanas.

## 3. Caminho B — Extensão incremental (sem `partidas` genéricas)

Mantém `entries` como está. Adiciona cirurgicamente:
- **Obras:** tabela `obras` (estado em_andamento→vendida) + `entries.obra_id` + contas de
  estoque; custo de obra cai em conta de **estoque** (a DRE ignora); venda = par de entries
  amarrados (saída estoque / entrada CPV). Entrega a **DRE Incorporadora por obra**.
- **Planos por empresa:** `company_id` + `tipo` no `chart_of_accounts` (ver de-para).
- **Consórcio (R$ 22,87 k):** grupo de 2–3 entries amarrados por `group_id` (taxa→DRE,
  consórcio→patrimonial, caixa). A taxa aparece na DRE; o resto é visual.
- **Datas emissão/competência NOT NULL** (vale para os dois caminhos).

**O que B NÃO entrega:** Balanço **fechado** por partida dobrada (só um Balanço **gerencial
aproximado** = saldos + a-pagar/receber em aberto + estoque de obra); Consolidada com
eliminações contábeis amarradas.

**Esforço/risco:** **baixo-médio.** Aproveita a DRE viva quase intacta; não toca
cartão/Hotmart; **portão F5 trivial** (a DRE Digital praticamente não muda). Ordem: dias.

## 4. Trade-off honesto (a decisão é sua)

| | A — Partida dobrada | B — Extensão |
|---|---|---|
| Balanço patrimonial fechado | ✅ de verdade | ⚠️ gerencial aproximado |
| Consórcio / obra-estoque | ✅ natural | ⚠️ por entries amarrados |
| Consolidada auditável | ✅ | ⚠️ parcial |
| Risco ao sistema vivo (R$ 342 k + cartão + Hotmart) | 🔴 alto | 🟢 baixo |
| Toca a Hotmart? | 🔴 A1 sim / A2 não | 🟢 não |
| Prazo | semanas | dias |
| Portão F5 | pesado (3 fontes + 5 sintéticos) | trivial |

- Se a Carteira 360º precisa de **Balanço contábil fechado + Consolidada auditável**, só
  **A** entrega — pagando o risco de reescrever um núcleo vivo.
- Se o alvo é **DRE gerencial das 3 empresas + custo por obra + visão patrimonial para
  decisão** (o uso relatado), **B** entrega ~80% do valor com ~20% do risco.

## 5. Recomendação — híbrido faseado

Começar por **B** (vitórias de baixo risco: planos por empresa, obras/estoque, datas
`NOT NULL`, esvaziar o balde de R$ 342 k) e **reavaliar A** para o Balanço fechado depois,
com o balde limpo e a DRE das 3 empresas estável. Respeita "cada fase deixa o app de pé" e
não põe a Hotmart em risco.

## 6. Resultado do POC executado (read-only, produção, dado real)

Construí as **partidas de resultado virtuais** das 3 fontes (`entries` + cartão + Hotmart)
em CTE e comparei conta-a-conta com `dre_by_competency`. **Nada foi gravado.**

| Empresa | Total partidas | Total DRE viva | Contas divergentes |
|---|---:|---:|---:|
| Digital (abr–jun) | 2.851.299,13 | 2.851.299,13 | **0** |
| Digital (ano 2026) | 6.035.851,10 | 6.035.851,10 | **0** |
| Incorporadora (ano) | 39.342,59 | 39.342,59 | **0** |
| Participações (ano) | 3.225,93 | 3.225,93 | **0** |

**Conclusão empírica:** a transformação `entries/cartão/Hotmart → partidas de resultado` é
determinística e **reproduz a DRE atual ao centavo, nas 3 empresas**. O portão F5, do lado
de **resultado**, é atingível com risco baixo — a migração para partidas **não muda a DRE**.

### Descoberta que reposiciona o trade-off
1. **O risco de A NÃO está na DRE** (ela bate). Está em construir o **lado patrimonial**
   (Balanço) do zero, reescrever o **form/ingest** para multi-partida, e cobrir as **3
   fontes** (cartão/Hotmart não são `entries`).
2. **A partida dobrada elimina os 5 hacks sintéticos.** Hoje HOT-2 (taxa) e HOT-3
   (comissões) são linhas sintéticas porque Hotmart não gera lançamento. Com partidas, cada
   venda vira partidas em contas **reais que já existem no plano** (`2.2.01 Hotmart`,
   `4.2.01/4.2.02 Comissões`) — e `NC-1/NC-2` viram partidas numa conta "(a classificar)".
   A DRE deixa de precisar de código especial.

### O que o POC NÃO provou (e por quê)
O **lado patrimonial** (Ativo=Passivo+PL) não é provável por query — depende das
contrapartidas + saldos iniciais + contas patrimoniais que **ainda não existem**. É
trabalho de **construção**, não de prova. Um Supabase branch efêmero validaria o **DDL
físico** (constraint de balanceamento débito=crédito), mas com **dados de amostra** (branch
não clona produção) — inferior à prova acima. Disponível se você quiser, mas não move a
decisão A×B.
