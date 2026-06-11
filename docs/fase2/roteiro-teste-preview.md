# Roteiro de teste — preview da Fase 2 (antes do cutover)

> **📜 HISTÓRICO — roteiro CUMPRIDO em 2026-06-10.** O cutover foi feito (o
> app TS é o de produção), a branch `fase-2-ts` foi deletada, a Fase 3 foi
> aplicada e a Fase 4 foi descartada por design. Este arquivo fica como
> registro do processo — as instruções abaixo não se aplicam mais.

> Objetivo: validar o app novo (branch `fase-2-ts`) com os dados reais **antes**
> de mergear na master (= virar o app de produção que a Lívia usa).

## ⚠️ Leia primeiro — o preview NÃO é sandbox

O preview da Vercel aponta para o **mesmo banco de produção** (mesmo Supabase).
Logo: **qualquer escrita mexe nos dados reais.** Por isso cada item está marcado:

- 👁️ **Só olhar** — seguro, não altera nada.
- ✍️ **Escreve de verdade** — use dados de teste (importe um OFX de teste, crie
  uma categoria "TESTE", etc.) e **apague depois**. Nunca exclua/renomeie algo
  real "só pra ver".

Se achar qualquer coisa errada: **anota e me manda** — eu corrijo na branch, sem
nenhum impacto na produção atual (que segue intacta na master).

## Onde abrir o preview

Vercel → projeto **categorizador-fatura** → **Deployments** → procurar o deploy
da branch **`fase-2-ts`** → abrir a URL de preview. Logar com tua conta real.

Dica de ouro: deixa **duas abas** abertas lado a lado — o app **ANTIGO**
(produção: categorizador-fatura.vercel.app) e o **NOVO** (preview) — e compara os
números da mesma fatura.

---

## 1. Login 👁️
- [ ] Tela de login abre, com o cartão 💳 e "RB7 Financeiro".
- [ ] **Não existe** aba/opção de "Criar conta" (signup fechado).
- [ ] Login com e-mail/senha entra normal.

## 2. Faturas de Cartão 🔴 CRÍTICO (é o uso diário da Lívia)
**Lista** 👁️
- [ ] As **3 faturas** aparecem (Jan, Fev, Março) com nome, total, nº de
      lançamentos e data.
- [ ] "Fatura Março (2)" mostra **R$ 140.585,04**.

**Abrir uma fatura** 👁️
- [ ] Abrir "Fatura Março (2)": **188 lançamentos**, footer "Total: R$ 140.585,04".
- [ ] Cada linha: data, descrição, valor, categoria colorida, badge **"✦ auto"**
      onde foi categorizado automático.
- [ ] Compare com o app antigo: **mesmos números, mesmas categorias, mesmas cores**.

**Aba Lançamentos** 👁️
- [ ] Busca por descrição filtra (ex.: digitar "IOF").
- [ ] Pílulas de categoria mostram contagem (ex.: "Ferramenta (59)"); clicar
      filtra; clicar de novo desfaz.
- [ ] Filtros "Todos" / "Sem categoria" funcionam.

**Categorizar** ✍️ (salva de verdade)
- [ ] Trocar a categoria de **uma** transação e confirmar que muda na hora.
      → **Volte pro valor original depois** (ou escolha uma já categorizada e só
      confira que o valor persiste ao recarregar a página).

**Aba Dashboard** 👁️
- [ ] KPIs (total, maior categoria, ticket médio, sem categoria).
- [ ] Ranking por categoria + rosca (donut).
- [ ] Clicar numa categoria do ranking → leva pra aba Lançamentos **já filtrada**
      naquela categoria (drill-down).

**Aba Compras** 👁️
- [ ] Itens de compra daquela fatura aparecem (se houver).

**Exportar** 👁️ (baixa arquivo, não altera banco)
- [ ] Menu Exportar → **CSV**: baixa `fatura_categorizada.csv`; abrir no Excel,
      conferir acentos e valores (vírgula decimal).
- [ ] Menu Exportar → **Excel (.xlsx)**: baixa e abre com colunas/valores certos.
- [ ] Com um filtro ativo, o menu mostra "filtrados (N)" vs "todos (N)".

**Importar OFX** ✍️ (cria fatura real — use um arquivo de teste)
- [ ] "Importar .OFX" com um OFX de teste → cria a fatura, abre o **modal de
      pendentes** (se houver itens pendentes), agrupado por mês.
- [ ] "Pular" mantém os pendentes; ou importar atrela à fatura.

**Excluir fatura** ✍️ (só na fatura de TESTE que você importou)
- [ ] Botão ✕ → aparece o **confirm** com o texto "Excluir a fatura ... Essa ação
      não tem desfazer." → confirmar remove **só a de teste**.
- [ ] ⚠️ **NÃO** exclua as 3 faturas reais da Lívia.

## 3. Compras (pendentes) 👁️ / ✍️
- [ ] No menu lateral, "Compras" tem um **badge** com a contagem (ex.: 9).
- [ ] A página mostra os itens **agrupados por mês** (Mai/2026, Abr/2026).
- [ ] ✍️ (opcional) Adicionar um item "TESTE" → badge sobe; excluir → volta.

## 4. Contas a Pagar / Contas a Receber ✍️ (tabela vazia — seguro testar e limpar)
- [ ] "Novo lançamento": preencher descrição, valor, vencimento, categoria →
      salvar → aparece na lista; KPI "Em aberto" reflete.
- [ ] Botão ✓ "marcar como pago" → status vira "Pago", total move pra "Pago".
- [ ] Editar (lápis) e Excluir (lixeira, com confirm) funcionam.
- [ ] "Contas a Receber" abre com o rótulo "Recebido".
- [ ] **Apague o lançamento de teste no fim.**

## 5. Extratos (OFX) ✍️ (precisa de conta corrente)
- [ ] Sem conta corrente cadastrada, a tela avisa pra cadastrar em Contas.
- [ ] (opcional) Cadastrar uma conta corrente de TESTE em "Contas & Cartões",
      importar um OFX de extrato → linhas com sinais (débito vermelho, crédito
      verde); reimportar mostra "0 novas · N duplicadas".
- [ ] Apague a conta de teste depois (me avisa que eu limpo as transações dela).

## 6. Hotmart 👁️ / ✍️
- [ ] KPIs preenchidos: **~13.068 vendas**, Bruto ~R$ 14,8 mi, Líquido ~R$ 14,5 mi.
- [ ] Tabela com as vendas recentes (mostra 300, com nota "de N").
- [ ] Filtro de mês funciona.
- [ ] ✍️ Botão **"Sincronizar com a Hotmart"** → roda e mostra "Sincronizado · N
      vendas". (É idempotente — pode clicar à vontade.)

## 7. Contas & Cartões 👁️
- [ ] O cartão **"Cartão Sicoob RB7"** aparece.

## 8. Categorias 👁️ / ✍️
- [ ] Aba "Transações": as **12 categorias** com cor e **contagem de uso**
      (Ferramenta 145, Imposto 102, Viagem 86...).
- [ ] Aba "Compras": as 8 categorias de compra.
- [ ] ✍️ Criar uma categoria "TESTE", recolorir, renomear, **excluir** — só na de
      teste. ⚠️ **NÃO** renomeie/exclua categorias reais (renomear muda o rótulo em
      todas as transações da Lívia).

## 9. Dashboard (home) 👁️
- [ ] Topo "Cartão de crédito": total R$ 367.291,77, 3 faturas, 519 transações,
      pizza por categoria, barras por fatura.
- [ ] Base "Contas a pagar & receber": KPIs (vão se preencher conforme uso) e o
      Hotmart líquido do mês.

## 10. Geral 👁️
- [ ] Abrir o console do navegador (F12) e navegar pelas telas — **sem erros
      vermelhos**.
- [ ] Visual consistente (cores, fontes), nada quebrado.

---

## Veredito

- ✅ **Tudo bate / sem surpresas** → me dá o OK e eu faço o cutover (merge
  `fase-2-ts` → master). A partir daí o app novo é o de produção.
- ⚠️ **Achou algo** → me lista; corrijo na branch e você revalida. Produção atual
  segue intocada até o merge.

> Depois do cutover vêm a Fase 3 (qualidade de dados — ex.: o item "Mercado Livre
> 2 monitor" que mostra 1,16398 em vez de 1.163,98) e a Fase 4 (migração
> transactions → bank_transactions), cada uma com SQL revisado por você.
