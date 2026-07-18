# Saneamento determinístico — abril a junho/2026

> Auditoria, aplicação e validação executadas em 18/07/2026 no projeto vivo
> `qdnqghefwjpeiidjlzjy`, após revisão e aprovação explícita do Luiz.

## Resumo executivo

O universo auditado contém **98 entries sem conta** (R$ 245.021,88) e **9 lançamentos
invisíveis** na DRE (R$ 41.043,82). A análise separou o que é determinístico do que exige
decisão contábil:

| Lote | Qtd. | Valor | Tratamento |
|---|---:|---:|---|
| Invisíveis — entries | 8 | R$ 41.040,62 | aplicado e validado |
| Invisível — cartão | 1 | R$ 3,20 | aplicado e validado |
| Sem conta — determinísticos | 11 | R$ 9.010,07 | aplicado e validado |
| Obras com nome explícito | 53 | R$ 107.793,06 | aguarda aprovação para capitalizar em estoque |
| Obras sem destino inequívoco | 7 | R$ 28.388,04 | exige obra/conta definida manualmente |
| Conta pessoal | 27 | R$ 99.830,71 | exige política para despesas pessoais/faturas agregadas |

## Lote determinístico aplicado

A migration aplicada é
[`20260718153823_saneamento_deterministico_abr_jun.sql`](../../supabase/migrations/20260718153823_saneamento_deterministico_abr_jun.sql).

### 1. Lançamentos invisíveis

- 7 comissões atualmente lançadas como `payable` nas contas de receita Apruma/Trampolim
  vão para `4.2.03 Comissão de Closers / Vendas`.
- 1 salário proporcional de mentor da Colheita vai para `6.1.05 PJs / Prestadores Fixos`.
- 1 proteção contra perda/roubo do cartão vai de `2.3.01 Taxa de Cartão` para
  `6.3.13 Seguros`.

Evidência: lançamentos históricos equivalentes dos mesmos profissionais já usam `4.2.03`;
salários/mentores equivalentes usam `6.1.05`. O cartão descreve seguro, não taxa de
adquirência.

Impacto na Digital:

| Mês | Conta | Valor que passa a aparecer na DRE |
|---|---|---:|
| Abril | 4.2.03 | R$ 8.502,97 |
| Maio | 4.2.03 | R$ 12.624,58 |
| Maio | 6.3.13 | R$ 3,20 |
| Junho | 4.2.03 | R$ 14.913,07 |
| Junho | 6.1.05 | R$ 5.000,00 |
| **Total** |  | **R$ 41.043,82** |

Como esses itens evaporavam, o lucro da Digital **caiu R$ 41.043,82** após a correção.

### 2. Sem conta com destino factual

- Tarifas Sicoob: `8.2 Despesas Financeiras`.
- DARF INSS e FGTS: `6.1.02 Encargos (INSS / FGTS)`.
- Contabilidade da Incorporadora: `6.3.03 Contabilidade / Honorários`.
- CSLL da Incorporadora: `11 IRPJ e CSLL`.

São 11 entries e R$ 9.010,07. O total do lucro não mudou: o valor já estava na linha NC-2;
apenas saiu do balde genérico e passou para as contas corretas.

## Resultado validado no banco

- As 19 entries, somando R$ 50.050,69, ficaram exatamente nas contas previstas.
- O lançamento de cartão de R$ 3,20 passou de `2.3.01` para `6.3.13`.
- O `entry_audit_log` registrou 19 alterações de `chart_of_account_id`.
- Na Digital, `4.2.03` aumentou R$ 36.040,62, `6.1.05` aumentou R$ 5.000,00 e
  `6.3.13` aumentou R$ 3,20 — impacto total de R$ 41.043,82.
- Na Incorporadora, a NC-2 caiu R$ 7.955,15; na Participações, caiu R$ 1.054,92.
  Os R$ 9.010,07 apenas foram reclassificados e não alteraram o lucro dessas empresas.
- Nenhum dos lotes deliberadamente excluídos foi alterado.

## Decisões mantidas fora da migration

### Obras explícitas

Foram encontrados 53 lançamentos ainda sem `obra_id` e sem conta, mas com o nome da obra
na descrição:

| Obra | Qtd. | Valor |
|---|---:|---:|
| Alfenas | 33 | R$ 56.467,31 |
| Cristais | 20 | R$ 51.325,75 |
| **Total** | **53** | **R$ 107.793,06** |

Por mês: abril R$ 39.858,47; maio R$ 37.087,99; junho R$ 30.846,60.

Capitalizá-los em `1.2 Estoque de obras em andamento` retira R$ 107.793,06 da NC-2 da
Incorporadora e aumenta o lucro do período no mesmo valor, até a baixa futura para CPV.
Por alterar o resultado, este lote precisa de aprovação contábil específica.

### Obras sem nome explícito

Restam 7 itens (R$ 28.388,04): cinco compras de materiais sem indicação Alfenas/Cristais
e duas parcelas de betoneira. É necessário definir a obra e se a betoneira é estoque,
imobilizado ou despesa.

### Conta pessoal

Os 27 itens somam R$ 99.830,71. Seis são faturas agregadas de Sicoob/C6, sem conta
financeira, fatura importada ou detalhamento de transações correspondente. Não é seguro
inferir a composição. Consórcios e demais despesas pessoais também dependem da política
definida para a empresa `RAFAEL BRITO - CONTA PESSOAL`.

## Guardas da migration

- IDs exatos, quantidade e soma total são conferidos antes do UPDATE.
- A conta anterior de cada invisível também é conferida.
- Se qualquer lançamento sem conta já tiver sido corrigido, o apply aborta.
- Se abril, maio ou junho estiver fechado, o apply aborta.
- Tudo ocorre atomicamente; falha em qualquer guarda desfaz o lote inteiro.
- O `entry_audit_log` registra os 19 UPDATEs de entries.

## Registro da aplicação

O snapshot pré-apply confirmou 19 entries, R$ 50.050,69, 19 estados anteriores válidos,
todos os destinos disponíveis e nenhum período fechado. O `apply_migration` concluiu de forma
atômica e o `list_migrations` registrou a versão real `20260718153823`. O snapshot pós-apply
confirmou todos os destinos, valores, efeitos na DRE e eventos de auditoria descritos acima.
