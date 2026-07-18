# Pendências contábeis — fechamento abril a junho/2026

> Snapshot somente leitura executado em 18/07/2026 no Supabase de produção, depois da
> migration `20260718153823_saneamento_deterministico_abr_jun`.
> Este documento não autoriza nem executa reclassificações.

## Estado depois do lote determinístico

| Empresa | Pendências sem conta | Valor |
|---|---:|---:|
| RB7 Incorporadora | 60 | R$ 136.181,10 |
| Rafael Brito — Conta Pessoal | 27 | R$ 99.830,71 |
| **Total** | **87** | **R$ 236.011,81** |

Não restaram lançamentos sem conta no período nas demais empresas. Os 87 itens se dividem
exatamente em 53 custos de obra explícitos, 7 itens de obra ambíguos e 27 itens pessoais.

## 1. Obras explícitas — decisão de capitalização

São 53 lançamentos (R$ 107.793,06) cuja descrição contém literalmente `Alfenas` ou
`Cristais`. A sugestão contábil é vincular cada item à obra correspondente e usar a conta
patrimonial `1.2 Estoque de obras em andamento` enquanto a obra não for vendida.

| Obra | Mês | Qtd. | Valor |
|---|---|---:|---:|
| Alfenas | 04/2026 | 15 | R$ 26.184,25 |
| Alfenas | 05/2026 | 9 | R$ 22.879,22 |
| Alfenas | 06/2026 | 9 | R$ 7.403,84 |
| Cristais | 04/2026 | 6 | R$ 13.674,22 |
| Cristais | 05/2026 | 5 | R$ 14.208,77 |
| Cristais | 06/2026 | 9 | R$ 23.442,76 |
| **Total** |  | **53** | **R$ 107.793,06** |

### Bloqueio operacional encontrado

- Apenas **5 lançamentos (R$ 12.404,18)** têm `account_id` e conta patrimonial de caixa vinculada.
- **48 lançamentos (R$ 95.388,88)** estão pagos, mas não informam qual conta financeira pagou.
- A busca no extrato bancário não encontrou correspondência exata por data e valor para esses 48.
- Portanto, não é seguro inventar a contrapartida das partidas dobradas.
- A capitalização retiraria R$ 107.793,06 da NC-2 e aumentaria o lucro abr–jun no mesmo valor
  até a futura baixa para CPV. Precisa de aprovação contábil explícita.

## 2. Obras ambíguas

| Data | Descrição | Valor | Decisão necessária |
|---|---|---:|---|
| 08/04/2026 | SANECAMP - COMPRA DE TIJOLOS | R$ 4.500,00 | Definir se pertence a Alfenas ou Cristais |
| 14/04/2026 | PARAÍBA FERRAGENS | R$ 5.270,00 | Definir se pertence a Alfenas ou Cristais |
| 16/04/2026 | LEAL GESSO - Roda Teto | R$ 209,00 | Definir se pertence a Alfenas ou Cristais |
| 21/04/2026 | MADEREIRA DO ZETINHO - Compra de Tábuas | R$ 10.000,00 | Definir se pertence a Alfenas ou Cristais |
| 24/04/2026 | G4 CONSTRUÇÕES - Compra cimento | R$ 6.400,00 | Definir se pertence a Alfenas ou Cristais |
| 28/04/2026 | PAGAMENTO BETONEIRA - PARCELA 1/5 | R$ 1.004,52 | Definir obra e se é estoque, imobilizado ou despesa |
| 29/05/2026 | PAGAMENTO BETORNEIRA - PARCELA 2/5 | R$ 1.004,52 | Definir se pertence a Alfenas ou Cristais |
| **Total** | **7 lançamentos** | **R$ 28.388,04** |  |

## 3. Conta pessoal

| Grupo detectado | Qtd. | Valor |
|---|---:|---:|
| Fatura agregada | 6 | R$ 78.653,41 |
| Tributo pessoal | 4 | R$ 7.390,60 |
| Consórcio | 3 | R$ 5.230,00 |
| CONCAMP | 6 | R$ 4.129,57 |
| Moradia pessoal | 5 | R$ 2.361,56 |
| Honorários IRPF | 1 | R$ 1.100,00 |
| Saúde | 2 | R$ 965,57 |
| **Total** | **27** | **R$ 99.830,71** |

### Relação lançamento a lançamento

| Data | Descrição | Grupo | Valor |
|---|---|---|---:|
| 10/04/2026 | CONSÓRCIO BRADESCO | Consórcio | R$ 1.750,00 |
| 11/04/2026 | FATURA - SICOOB PF | Fatura agregada | R$ 31.228,74 |
| 15/04/2026 | GUIA IPVA S10 (3/3) | Tributo pessoal | R$ 2.872,00 |
| 15/04/2026 | GUIA IPVA ANA (3/3) | Tributo pessoal | R$ 1.819,03 |
| 20/04/2026 | FATURA CARTÃO C6 - PF | Fatura agregada | R$ 98,00 |
| 20/04/2026 | CONCAMP 20 | CONCAMP | R$ 772,84 |
| 24/04/2026 | LÚCIA - AJUDANTE CASA RAFA | Moradia pessoal | R$ 1.250,00 |
| 28/04/2026 | CONTA DE ÁGUA - CASA DO RAFA | Moradia pessoal | R$ 106,17 |
| 10/05/2026 | UNIMED RAFA | Saúde | R$ 607,84 |
| 10/05/2026 | CONCAMP 10 | CONCAMP | R$ 604,16 |
| 10/05/2026 | CONSÓRCIO BRADESCO | Consórcio | R$ 1.750,00 |
| 11/05/2026 | FATURA SICOOB - PF | Fatura agregada | R$ 26.623,19 |
| 18/05/2026 | CONTA DE LUZ - CASA RAFA | Moradia pessoal | R$ 386,35 |
| 20/05/2026 | CONCAMP 20 | CONCAMP | R$ 772,84 |
| 20/05/2026 | FATURA C6 - PESSOA FÍSICA | Fatura agregada | R$ 98,00 |
| 26/05/2026 | CONTA DE ÁGUA - CASA DO RAFA | Moradia pessoal | R$ 214,95 |
| 29/05/2026 | IPTU - CASA RAFA | Tributo pessoal | R$ 846,71 |
| 29/05/2026 | IPTU - LOTE RAFA | Tributo pessoal | R$ 1.852,86 |
| 10/06/2026 | COOPARTICIPAÇÃO - UNIMED RAFA | Saúde | R$ 357,73 |
| 10/06/2026 | CONCAMP 10 | CONCAMP | R$ 604,16 |
| 10/06/2026 | CONSÓRCIO BRADESCO 01 - PF RAFA | Consórcio | R$ 1.730,00 |
| 11/06/2026 | FATURA PF - SICOOB | Fatura agregada | R$ 20.504,64 |
| 15/06/2026 | CONCAMP 20 | CONCAMP | R$ 771,41 |
| 15/06/2026 | CONTA DE LUZ - CASA DO RAFA | Moradia pessoal | R$ 404,09 |
| 18/06/2026 | BOLETO CONTABILIDADE - HONORÁRIOS IRPF RAFA | Honorários IRPF | R$ 1.100,00 |
| 18/06/2026 | CONCAMP - PUBLI | CONCAMP | R$ 604,16 |
| 20/06/2026 | FATURA C6 - PF | Fatura agregada | R$ 100,84 |

Decisões necessárias: detalhar as seis faturas agregadas; definir se consórcios são
patrimoniais e qual parcela é taxa/seguro; e estabelecer a política para moradia, saúde,
tributos, CONCAMP e demais despesas pessoais.

## 4. Demais respostas do contador

| Tema | Situação viva | Resposta necessária |
|---|---|---|
| Apropriação de mentorias | 16 `product_id` candidatos | IDs elegíveis, início, duração, centavos, reembolsos e histórico |
| Consórcios | 18 lançamentos no histórico | rateio fundo/reserva × taxa/seguro/despesa |
| Saldos de abertura | 6 contas financeiras ativas | saldo, data-base, capital, imobilizado e caixa inicial |
| Produtos Hotmart abr–jun | 0 sem mapa/conta de receita | nenhuma pendência técnica |
| Reembolso de tráfego `2.4.03` | 1 lançamento, R$ 4.067,46 | confirmar natureza e apresentação na DRE |
| DRE abr–jun | ferramenta saneada no lote determinístico | fornecer gabarito mensal do contador |
| Consolidada | estrutura ainda não concluída | equivalência patrimonial × dividendos |

## Ordem segura para continuar

1. Contador responde o vínculo/tratamento das obras e da conta pessoal.
2. Luiz revisa o SQL gerado a partir dessas respostas e aprova explicitamente.
3. A migration é aplicada atomicamente, com snapshot pré/pós.
4. As contas de pagamento que faltam são informadas antes de gerar as partidas do Balanço.
5. Só depois entram estoque → CPV, apropriação de mentorias, Balanço com saldos e Consolidada.

A fila visual já existe nas telas `/custo-por-obra` e `/classificar-despesas`.
A tela de custo por obra também passou a evidenciar lançamentos sem conta de pagamento,
evitando que a capitalização pareça completa quando a contrapartida do razão ainda falta.
