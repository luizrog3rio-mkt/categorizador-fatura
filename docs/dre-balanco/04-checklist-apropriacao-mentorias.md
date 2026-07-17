# Checklist para o contador — apropriação mensal de mentorias

Este formulário fecha somente as decisões que o sistema não pode inferir dos dados.
O levantamento dos `product_id`, nomes e valores sai do bloco 5 de
[`supabase/audit/20260717_contador_abr_jun.sql`](../../supabase/audit/20260717_contador_abr_jun.sql).

## 1. Política por produto Hotmart

Preencher uma linha para cada `product_id` que deve ter receita apropriada ao longo da
prestação. Produtos homônimos permanecem separados porque a chave é o ID da Hotmart.

| product_id | Produto | Apropriar? | Meses padrão | Início da prestação | Vigência da regra |
|---:|---|:---:|---:|---|---|
|  |  | sim / não |  | venda / 1º encontro / assinatura / manual |  |

Se o início não for o mês da venda, informar de onde a data virá e quem poderá corrigi-la
por contrato. A implementação terá override por venda para exceções de duração ou turma.

## 2. Regras gerais — marcar uma opção

1. Diferença de centavos:
   - [ ] primeira competência recebe o ajuste;
   - [ ] última competência recebe o ajuste.
2. Reembolso ou chargeback depois de já reconhecer receita:
   - [ ] estornar integralmente no mês do evento;
   - [ ] estornar cada competência original;
   - [ ] interromper somente as parcelas futuras e tratar o reconhecido à parte.
3. Cancelamento sem devolução financeira:
   - [ ] manter a grade original;
   - [ ] interromper as parcelas futuras;
   - [ ] reconhecer o saldo no mês do cancelamento.
4. Troca de turma/data:
   - [ ] mover apenas competências futuras;
   - [ ] recalcular toda a grade ainda em período aberto;
   - [ ] nunca recalcular automaticamente; exigir ajuste manual auditado.
5. Taxa Hotmart e comissões:
   - [ ] continuam no mês da venda/evento financeiro;
   - [ ] acompanham a mesma grade da receita.

## 3. Histórico e período fechado

- Primeira competência alcançada pela nova regra: ____/____.
- Abril, maio e junho/2026 devem ser recalculados? [ ] sim [ ] não.
- Se uma nova informação atingir período fechado:
  - [ ] lançar ajuste no primeiro mês aberto;
  - [ ] reabrir o período com autorização do contador;
  - [ ] bloquear e exigir decisão manual.

## 4. Gabarito de aceite

Antes de ativar a política em produção, o contador entrega ou valida:

- DRE esperada de abril, maio e junho por conta de receita;
- total bruto por `product_id` antes e depois da apropriação;
- uma venda normal, uma com diferença de centavos e uma com reembolso/chargeback;
- confirmação de que a soma da grade de cada venda é exatamente o bruto elegível;
- confirmação de que nenhuma venda aparece simultaneamente no mês da venda e na grade.

Com o checklist preenchido, a migration pode ser escrita sem hipótese contábil e submetida
ao rito obrigatório: revisão do SQL pelo Luiz, aprovação explícita, aplicação via MCP,
renomeação para a versão real e comparação pré/pós com o gabarito.
