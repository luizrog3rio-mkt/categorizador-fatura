# Reunião com o contador — plano de execução de 15/07/2026

Fonte: `ESTRUTURAÇÃO 360º - RB7- 1507.pdf` e resumo visual enviados pelo Luiz.

## Entregue no código em 17/07/2026

- Plano de Contas administra contas de resultado e patrimoniais, com filtro e escopo por empresa.
- Contas de resultado podem continuar compartilhadas ou ser específicas de uma empresa.
- Contas patrimoniais exigem empresa e ficam identificadas como fora da DRE.
- Contas a Pagar/Receber permitem tratamento contábil patrimonial, incluindo `Consórcio a Contemplar`.
- A troca de empresa impede manter uma conta contábil específica de outra empresa por engano.
- O seletor impede combinações natureza × tipo que fariam o lançamento desaparecer da DRE.
- Cartão aceita custos válidos ou contas patrimoniais; receita/dedução incompatíveis não são oferecidas.
- Importação exige `Competência` e `Conta contábil`, valida cada linha antes de gravar e aceita código ou nome exato.
- Recorrência carrega emissão, competência, Conta do Plano e Produto DRE para o mês seguinte.
- PIS, COFINS, ICMS e ISS recebem guarda adicional: se tratados como resultado, exigem natureza `Dedução`.

Essas entregas usam as colunas e contas já aplicadas no banco. Não exigem migration nova.

## Pendente de decisão contábil — apropriação de mentorias

A ferramenta ainda reconhece a receita Hotmart integralmente em `sale_date`. Implementar diluição sem as respostas abaixo criaria números arbitrários na DRE:

1. Quais `product_id` da Hotmart entram na apropriação.
2. Data inicial da prestação: venda, primeiro encontro, assinatura ou data informada manualmente.
3. Duração padrão por produto e possibilidade de override por contrato.
4. Critério para a última parcela quando houver diferença de centavos.
5. Tratamento de cancelamento, reembolso, chargeback e troca de turma.
6. Tratamento do histórico anterior ao início da regra.

### Arquitetura proposta após aprovação

- Política por produto com duração padrão e possibilidade de exceção por venda.
- Grade mensal imutável por venda, com total das competências igual ao bruto elegível.
- DRE substitui o bruto no mês da venda pela grade, sem dupla contagem.
- Taxa Hotmart e comissões continuam na competência atual até decisão específica do contador.
- Alterações e cancelamentos ficam auditados; período fechado continua bloqueando mudanças.
- Backfill de abril a junho roda somente depois da conciliação com o gabarito do contador.

Qualquer migration desse motor deve seguir o rito do projeto: SQL revisado pelo Luiz, aprovação explícita, aplicação via MCP, renomeação com a versão real e smoke pós-apply.

## Pendente de dado operacional

- Gabarito da DRE de abril, maio e junho.
- Rateio dos consórcios entre fundo/reserva patrimonial e taxa/seguro/despesa.
- Revisão dos produtos Hotmart que ainda estiverem em `HOT-1 (a classificar)`.
- Decisão sobre `2.4.03 REEMBOLSO DE TRÁFEGO`.
- Saldos de abertura para concluir o Balanço.

## Pacote de auditoria preparado em 17/07/2026

O arquivo read-only [`supabase/audit/20260717_contador_abr_jun.sql`](../../supabase/audit/20260717_contador_abr_jun.sql)
consolida as consultas para fechar as pendências acima: DRE abr–jun por empresa, baldes
`HOT-1`/`NC`, lançamentos invisíveis, impostos, candidatos à apropriação, consórcios,
competências a revisar e saldos de abertura. Ele não contém `INSERT`, `UPDATE`, `DELETE`
ou DDL e deve ser executado bloco a bloco pelo MCP autenticado.

As decisões da apropriação foram convertidas no formulário objetivo
[`04-checklist-apropriacao-mentorias.md`](04-checklist-apropriacao-mentorias.md), pronto para
o contador preencher sem precisar interpretar o schema do sistema.
