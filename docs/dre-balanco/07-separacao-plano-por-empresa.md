# Separação do plano de contas por empresa — 2026-07-18

> Pedido do Luiz: "as empresas precisam ser separadas, tem plano de contas repetindo em
> várias empresas. Eu te mandei a planilha dos planos de contas como tem que ser feito."
> Fonte da spec: `RB7_Plano_de_Contas_DRE.xlsx` (8 abas). Esta decisão REVOGA o modelo
> "compartilhado + específico" da Fase 1 (`20260715173423`).

## O problema (medido no banco vivo em 18/07)

- **106 contas de RESULTADO eram compartilhadas** (`company_id NULL`) e apareciam em TODAS
  as empresas — era a repetição que o Luiz via. As patrimoniais já eram por empresa.
- Uso cruzado real: 79 entries de fora da Digital classificados em contas compartilhadas
  (Incorporadora 42, Participações 12, Molho 1, Conta Pessoal 24). Todo o cartão (807
  transactions) e o mapa Hotmart (60) são da Digital.
- A lista misturada **induzia erro comprovado**: 15 lançamentos estavam em conta PATRIMONIAL
  de OUTRA empresa (itens pessoais no Balanço da Digital; custos de obra da Incorporadora na
  conta "Participação em RB7 Incorporadora" da Holding).

## O desenho (o que a planilha define)

| Empresa | Plano | Origem |
|---|---|---|
| RB7 DIGITAL | herda as 106 compartilhadas (ids preservados, zero remap) menos a 4.6 | aba "Plano de Contas" (o plano vivo já nasceu dela e foi estendido) |
| RB7 INCORPORADORA | receita da venda de casas, deduções (ISS/corretagem), CPV (4.6 movida pra cá), despesas fixas espelhadas, financeiro, IRPJ | aba "DRE Incorporadora" + uso real |
| RB7 PARTICIPAÇÕES | receita de participações (1 conta por participada), outras receitas, despesas da holding, IRPJ | aba "RB7 Participações" Bloco A |
| MOLHO DIGITAL | mínimo (receitas/co-produção, despesas, financeiro) | não está na planilha (é participada) — desenho nosso |
| CONTA PESSOAL | espelhos das contas que já usa | não está na planilha — desenho nosso |

Remap de entries **sempre preservando a natureza** → DRE de cada empresa não muda de valor
nem de seção. Na Participações os códigos mudam (plano da planilha): `6.3.03→2.1.01
Honorários contábeis`, `6.1.02→2.2.02 Encargos`, `8.2→2.3 Despesas Financeiras e Bancárias`
(mantida natureza financial — a planilha lista sob "Despesas da Holding", mas o conteúdo é
financeiro), `1.8→1.2.03 Outras receitas`.

## Decisões embutidas (aprovar junto com o SQL)

1. **Os 15 patrimoniais errados:** Conta Pessoal (10) vai pro próprio balanço dela — CONCAMP
   → `1.1 Consorcios a contemplar`; IPVA/licenciamento/pneus + faturas PF → `3.1 Movimentacoes
   pessoais do titular` (política de 18/07; as parcelas 3/3 dos MESMOS IPVAs já estão lá). O
   **Balanço da Digital deixa de carregar ~R$ 100k de itens pessoais**. Incorporadora (4 itens,
   R$ 2.785,67 — SOUZA ALTEFENAS, pedreiros) e Participações (1 DARF INSS, R$ 502,51) **voltam
   pra "A classificar"** (sem equivalente inequívoco; precedente "devolver inferências pra UI").
   ⚠️ Esses 5 passam a aparecer na NC-2 dessas empresas (eram invisíveis na DRE).
2. **Regras de sugestão:** as 4 globais viram da Digital; IOF/TARIFA clonadas pra
   Incorporadora (8.2), Conta Pessoal (8.2) e Participações (2.3). PEDÁGIO fica só na Digital.
3. **`finalizar_venda_obra`** recriada: acha o CPV por (empresa da obra, code 4.6).
4. Os 7 lançamentos com classificação semanticamente errada (fatura agregada como "Taxa de
   Cartão", transferência intercompany como "Outras Receitas") foram **preservados 1:1** na
   empresa dona — consertar semântica é outro assunto (o alerta de invisíveis já os aponta).

## Verificação

- **Dry-run em produção com rollback garantido** (exceção proposital no fim do bloco):
  todas as guardas passaram — `entries_remapeados=79 · partidas_remapeadas=32 ·
  pes_consorcio=1 · pes_movpessoais=9 · devolvidos_fila=5 · regras_clonadas=6`. Nada persistiu.
- Invariantes pós-apply embutidas no SQL: zero conta sem empresa; zero referência de resultado
  cruzando empresa; totais por (empresa, natureza) idênticos pré/pós; partidas com
  débito/crédito e contagem inalterados.
- Front: build (tsc strict) limpo, lint limpo, 64/64 testes vitest.

## Front (mesmo commit)

- `Lançamentos` e `Fatura` já filtravam por empresa via `contaDisponivelParaEmpresa` — com o
  fim das compartilhadas passam a mostrar SÓ o plano da empresa do lançamento, sem mudança.
- `ClassificarDespesas`: dropdown de conta manual filtra pela empresa ativa (no Consolidado
  agrupa por empresa); aplicar em massa pula item de outra empresa (com aviso); regra nova
  agora exige empresa e mostra badge da empresa na lista.
- `PlanoDeContas`: morreu a opção "compartilhadas"; toda conta nova exige empresa.
- `Produtos DRE` e `Mapear produtos`: seletor de conta de receita filtrado pras contas da
  RB7 DIGITAL (Hotmart é 100% Digital, company congelado).

## Migration

`supabase/migrations/20990101000000_separacao_plano_de_contas_por_empresa.sql`
(version placeholder — **NÃO APLICADA**; aguarda aprovação do Luiz; rito: `apply_migration`
via MCP → renomear com o version real → anotar APLICADA no header).
