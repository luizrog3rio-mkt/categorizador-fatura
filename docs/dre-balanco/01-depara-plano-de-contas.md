# De-para — Planilha `RB7_Plano_de_Contas_DRE.xlsx` × plano de contas vivo

> Insumo de decisão (F0 → F1). **Read-only, nada aplicado.** Fonte: banco vivo
> `qdnqghefwjpeiidjlzjy` em 2026-07-15 (102 contas em `chart_of_accounts`) × as 8 abas
> da planilha anexada ("ESBOÇO v2 para validação"). Serve para a decisão que o Luiz
> adiou: como estruturar o plano para 3 empresas + Balanço.

## Veredito em uma linha

A macroestrutura da **DRE da Digital já está no banco e casa ~100%** com a planilha —
na verdade o plano vivo é um **superset** (evoluiu além do esboço). O que **não existe
no banco**: todas as contas **patrimoniais (Balanço)**, o plano da **Holding**, o plano/
custo da **Incorporadora (obras)**. E o `chart_of_accounts` é **global, sem `company_id`
e sem `tipo`** — o que gera **colisão de código** (na DRE `1` = Receita; no Balanço `1` =
Ativo). Recomecar o plano seria destruir 102 contas já usadas por 955+ lançamentos.

## Placar por aba

| Aba da planilha | Vira | Já no banco | A criar | Conflito |
|---|---|---|---|---|
| Plano de Contas (DRE Digital, 1–12) | plano DRE Digital | **~63 contas ✓** (superset) | 3 placeholders de curso (não seedar) | 1 nature errada · códigos macro colidem c/ Balanço |
| Balanço Patrimonial | plano patrimonial Digital | **0** | **~40 contas** (Ativo/Passivo/PL) | código `1/2/3` colide com DRE |
| RB7 Participações | plano Holding (DRE + patrim.) | **0** | **~30 contas** | mesma colisão de código |
| Custo por Obra | contas de custo da Incorporadora + dimensão `obras` | **0** | ~15 contas de custo + tabela `obras` | — |
| DRE Gerencial | layout (produtos em coluna) | **✓ `dre_by_product` + 12 `dre_products`** | — | — |
| DRE Holding | layout (participadas em coluna) | **0** | relatório | depende de eq. patrimonial (em aberto) |
| DRE Consolidada | layout + eliminações | **0** | relatório | depende de intercompany |
| DRE Incorporadora | layout (obra em coluna) | **0** | relatório | depende de `obras` |

## Detalhe

### 1. DRE Digital — casa, e o vivo foi além
Bate 1:1 na macroestrutura (1 Receita → 2 Deduções → 4 Custos Var → 6 Despesas Fixas →
8 Financeiro → 9 Depreciação → 11 IRPJ) e em quase todas as analíticas. O **vivo tem ~30
contas reais a mais** que a planilha não previu, todas de operação legítima — ex.:
`6.3.07 Lanches`, `6.3.09 Cursos e Treinamentos`, `6.3.10 Multas`, `6.3.13 Seguros`,
`6.2.06 Projeto Moleque de Vila`, `1.1.08 Receitas a Classificar – Hotmart`. **Manter.**

**Divergências pontuais a resolver (decisão do Kaique/contador):**
- **`2.4.03 REEMBOLSO DE TRÁFEGO` tem `nature = revenue`** mas está sob "2.4 Reembolsos"
  (deduction). Ou o código está no galho errado, ou a nature está errada — hoje ela soma
  como **receita** dentro do bloco de deduções. É um bug contábil latente.
- **Placeholders de curso** (`1.2.02`, `1.2.03` "preencher nome") — a planilha os traz; o
  prompt manda **não seedar** placeholder. Só `1.2.01` foi nomeado no vivo ("Usando
  Oratória para Viralizar"). OK, seguir o prompt.
- Contas "a classificar" internas (`1.1.08`) — são baldes; conviver.

### 2. Balanço Digital — 100% a criar, e força a decisão de estrutura
As ~40 contas patrimoniais (Caixa, Contas a receber-plataformas, Estoque de livros,
Consórcio a Contemplar `B.1`, Imobilizado, Depreciação acumulada redutora, Fornecedores,
Empréstimos, Capital Social, `3.4 Resultado do exercício`…) **não existem**. Pontos:
- **Colisão de código:** no plano global atual, `1` já é "Receita Bruta". O Balanço quer
  `1` = "Ativo". Impossível coexistir sem **discriminador** (`tipo` dre/balanço) e/ou
  `company_id`.
- `1.4.07 (-) Depreciação acumulada` e `1.5.03 (-) Amortização` são **redutoras** — o
  schema-alvo do prompt tem a coluna `redutora: bool` para isso; o `chart_of_accounts`
  vivo **não tem** essa coluna.
- `3.4 Resultado do exercício (vem da DRE)` é a costura DRE→Balanço (F6).

### 3. Holding (RB7 Participações) — 100% a criar
Hoje os 15 lançamentos da Participações caem no **plano da Digital** (errado
conceitualmente). A aba traz Bloco A (DRE da holding: receita de participações,
despesas enxutas) + Bloco B (patrimonial: investimentos em participadas, dividendos a
receber/pagar). **Depende da pergunta em aberto** equivalência-patrimonial vs dividendos.

### 4. Incorporadora / Obras — 100% a criar
Hoje os 184 lançamentos da Incorporadora caem no plano da Digital como despesa comum.
A aba "Custo por Obra" define o plano de custos (Terreno, Projetos, Mão de obra, Material,
Instalações, Outros) que **acumula em ESTOQUE (ativo)** por obra e só vira CPV na venda.
Precisa: contas de custo próprias + tabela `obras` (máquina de estado em_andamento→vendida).

### 5. Produtos — casa
Os 11 produtos da "DRE Gerencial" (Mentoria Indiv., Apruma, Trampolim, Colheita, Cursos,
Ebooks, Livros, Recorrência, Palestras, Publicidade, Outras) = os 12 `dre_products` vivos
(+ "Não Rateado"). `rateio_por_produto` já é coluna do `chart_of_accounts`. **Nada a fazer
no F1** além de confirmar o de-para de nomes.

## Recomendação de estrutura (responde à decisão adiada)

**Estender o `chart_of_accounts`, não recriar** — reconciliando com as 102 contas vivas:
1. Adicionar **`company_id`** (as 3 empresas têm planos diferentes) — com uma estratégia
   para o plano compartilhado atual (a Digital já é o dono de fato das 102).
2. Adicionar **`tipo`** (`resultado`/`patrimonial`) ou equivalente, para o Balanço poder
   reusar códigos `1/2/3` sem colidir com a DRE — resolve a colisão sem inventar prefixo.
3. Adicionar **`redutora bool`** (depreciação/amortização acumuladas).
4. Seedar **só o que tem nome real** da planilha: Balanço Digital, plano Holding, plano
   Incorporadora — deixando as 102 contas de DRE Digital **intactas** (preserva as 955
   classificações e a DRE viva).
5. Corrigir `2.4.03` (nature) — **só com aval do contador**, e como dado, não estrutura.

⚠️ **Antes do seed (F1):** confirmar com o **Kaique** se esta planilha "v2 para validação"
é a versão aprovada — o plano vivo veio de uma "v2" anterior; pode haver uma v3.
