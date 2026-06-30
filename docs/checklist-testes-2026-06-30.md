# ✅ Checklist de Testes — RB7 Financeiro (mudanças de 30/06/2026)

> Faça com calma, **tela por tela**. Cada item tem **Como fazer** e **Esperado**. Marque `[x]` conforme passa.
> Comece pelos 🔴 (dinheiro). Dica: no seletor de empresa do topo, escolha **RB7 DIGITAL** (é onde tem mais dado) ao testar as DREs.
> Se algo não bater com o "Esperado", anota o item e me chama.

---

## 🔴 1. DRE  (menu: **DRE & Relatórios → DRE**)

- [ ] **1.1 — A receita do Hotmart aparece (fim do prejuízo falso)**
  - Como: abra a DRE, empresa **RB7 DIGITAL**, ano **2026**.
  - Esperado: a **Receita Bruta** mostra ~**R$ 3,6 milhões** (não R$ 0). O **Lucro** no rodapé é **positivo** (~R$ 3M), não um prejuízo de milhões.

- [ ] **1.2 — O alerta amarelo enxerga o cartão**
  - Como: leia o aviso "**Lançamentos fora desta DRE**" no topo (com RB7 DIGITAL).
  - Esperado: o texto cita o total geral **E** destaca o cartão — algo como *"…Destes, **912 são de cartão (R$ 584.568,06)** — classifique na aba Lançamentos da Fatura."* (antes contava só os entries).

- [ ] **1.3 — Análise vertical (% AV)**
  - Como: olhe a coluna **% AV** na tabela.
  - Esperado: cada linha mostra o **% sobre a receita bruta**.

- [ ] **1.4 — Export**
  - Como: clique em **Excel** e depois **CSV** no topo da tela.
  - Esperado: baixa o arquivo da DRE nos dois formatos.

- [ ] **1.5 — Rótulo da régua**
  - Como: leia o subtítulo da tela.
  - Esperado: diz **"regime de COMPETÊNCIA … inclui Hotmart + cartão"**.

---

## 🔴 2. DRE por Produto  (menu: **DRE & Relatórios → DRE por Produto**)

- [ ] **2.1 — Coluna % AV + Export**
  - Como: olhe a coluna **% AV**; clique **Excel**/**CSV**.
  - Esperado: % sobre a receita e os downloads funcionam.

- [ ] **2.2 — Rótulo**
  - Como: leia o subtítulo.
  - Esperado: diz **"COMPETÊNCIA … cartão NÃO entra (sem produto)"**.

---

## 🔴 3. DRE × Caixa  (menu: **DRE & Relatórios → DRE × Caixa**)

- [ ] **3.1 — Despesa não está mais inflada**
  - Como: abra a tela, RB7 DIGITAL, 2026.
  - Esperado: a coluna de **despesa (DRE)** bate com a despesa real (em 2026 = ~**R$ 301k**, não R$ 531k). A "Diferença" representa só descasamento de tempo.

- [ ] **3.2 — Rótulo**
  - Esperado: subtítulo diz **"descasamento de TEMPO … Hotmart não entra"**.

---

## 🔴 4. Contas a Pagar / Receber  (menu: **Conciliação Bancária → Contas a Pagar/Receber**)

- [ ] **4.1 — Conta do Plano agora é OBRIGATÓRIA**
  - Como: clique **Novo lançamento**, preencha descrição + valor + vencimento, **deixe a "Conta do Plano de Contas" vazia** e tente **Salvar**.
  - Esperado: **bloqueia** com a mensagem *"Escolha a 'Conta do Plano de Contas' — sem ela o lançamento não aparece na DRE."* O campo tem um `*` vermelho.
  - Depois: escolha uma conta e salve → **deve salvar normal**.

- [ ] **4.2 — Export**
  - Como: clique **Excel**/**CSV** no topo (visível mesmo pra quem não é admin).
  - Esperado: baixa só o que está **na tela** (respeita filtro de status, empresa e busca).

- [ ] **4.3 — Toast de sucesso**
  - Como: marque um lançamento como pago / crie um lançamento.
  - Esperado: aparece um **avisinho verde** no canto (some sozinho em ~3,5s).

---

## 🔴 5. Faturas de Cartão  (menu: **Conciliação Bancária → Faturas de Cartão**)

- [ ] **5.1 — OFX inválido não cria fatura-fantasma**
  - Como: tente importar um arquivo **que não seja um OFX de fatura válido** (ex.: um .txt vazio renomeado pra .ofx, ou um OFX de extrato).
  - Esperado: aparece o erro *"Nenhum lançamento encontrado no arquivo…"* e **NÃO cria** uma fatura de total R$ 0.

- [ ] **5.2 — Aviso de reimport duplicado**
  - Como: importe um OFX de fatura; depois **importe o MESMO arquivo de novo** (mesma conta).
  - Esperado: aparece uma confirmação *"Já existe uma fatura '…' nesta conta. Reimportar cria uma 2ª fatura e DOBRA a despesa na DRE…"*. Se você cancelar, **não importa**.
  - ⚠️ Se confirmar (intencional), aí sim duplica — é o comportamento esperado.

---

## 🟠 6. Dashboard  (menu: **Visão Geral → Dashboard**)

- [ ] **6.1 — KPI "Transações" exato**
  - Como: no **Consolidado**, olhe o card **Transações** na seção do cartão.
  - Esperado: mostra o número **exato** (ex.: **1112**), não travado em 1000.

- [ ] **6.2 — "Total das faturas" por empresa**
  - Como: troque o seletor de empresa (Consolidado → uma empresa específica → outra).
  - Esperado: o **Total das faturas** e a contagem mudam conforme a empresa (antes era sempre a soma de todas).

- [ ] **6.3 — Rótulo do "Resultado do mês"**
  - Esperado: abaixo do número tem a linha *"Projeção do mês … — não é a DRE por competência."*

---

## 🟠 7. Hotmart  (menu: **Receitas & Vendas → Hotmart**)

- [ ] **7.1 — Export**
  - Como: clique **Excel**/**CSV** no topo.
  - Esperado: baixa as vendas com todas as colunas.

- [ ] **7.2 — Colunas Grupo + Vendedor (sem "Canal")**
  - Como: olhe a tabela e o card "Total por grupo".
  - Esperado: tem **Grupo** e **Vendedor**; **não existe mais coluna "Canal"**.

- [ ] **7.3 — Atualização em tempo real (opcional/avançado)**
  - Como: deixe a tela aberta; quando entrar uma venda nova pelo webhook, a lista atualiza sozinha.
  - Esperado: sem precisar dar F5 (difícil de forçar — só observe se acontecer).

---

## 🟠 8. Origens  (menu: **Receitas & Vendas → Origens**)

- [ ] **8.1 — As 3 abas funcionam**
  - Como: entre em Origens e clique nas abas **Classificar**, **Regras**, **Vendedores**.
  - Esperado: cada aba carrega (a URL vira `/origens/classificar`, `/origens/regras`, `/origens/vendedores`).

- [ ] **8.2 — Criar uma regra classifica as vendas**
  - Como: na aba **Classificar**, escolha um `src`/`sck` da lista e clique **Criar regra**; salve.
  - Esperado: o valor **some da lista** de "a classificar" (foi aplicado).

- [ ] **8.3 — Venda nova já nasce classificada (automático)**
  - Como: difícil de forçar manualmente — mas a partir de agora, toda venda nova que casa uma regra **já entra classificada** (antes ficava "a classificar" até alguém mexer numa regra). Só observe ao longo dos dias.

- [ ] **8.4 — Cross-links**
  - Como: na aba **Vendedores**, clique no nome de um vendedor no relatório.
  - Esperado: leva pra aba **Regras** já aberta no grupo dele.

- [ ] **8.5 — Export em Vendedores**
  - Como: na aba Vendedores, no card "Vendas por vendedor", clique **Excel**/**CSV**.
  - Esperado: baixa o relatório por vendedor.

---

## 🟠 9. Plano de Contas  (menu: **Cadastros → Plano de Contas**)

- [ ] **9.1 — Vincular conta a um Produto DRE**
  - Como: edite uma conta de natureza **acima da margem** (receita/custo variável). Procure o select **"Produto DRE"**.
  - Esperado: dá pra escolher um produto; a lista mostra o produto vinculado (ou "a classificar"). (Substituiu o checkbox morto "Rateia por produto".)

---

## 🟠 10. Períodos Fechados  (menu: **DRE & Relatórios → Períodos Fechados**)

- [ ] **10.1 — Fechar um período trava de verdade**
  - Como: **feche** um período de teste (ex.: um mês antigo sem lançamentos importantes). Depois vá em Contas a Pagar e tente **criar/editar** um lançamento com competência **nesse mês fechado**.
  - Esperado: **bloqueia** com a mensagem *"Período … está fechado…"*.
  - Depois: **reabra** o período → consegue lançar de novo. *(Lembre de reabrir o período de teste no fim.)*

---

## 🟠 11. Log de Deleções (NOVO)  (menu: **DRE & Relatórios → Log de Deleções**)

- [ ] **11.1 — A tela abre**
  - Como: abra `/delecoes`.
  - Esperado: a tela carrega (provavelmente vazia: *"Nenhuma deleção registrada…"*).

- [ ] **11.2 — Uma exclusão vira registro**
  - Como: crie um lançamento de teste em Contas a Pagar e **exclua** ele. Volte no **Log de Deleções**.
  - Esperado: aparece uma linha com **Quando · Tipo (Lançamento) · o resumo (descrição — R$ valor) · quem (seu e-mail)**.

---

## 🟢 12. Geral (em qualquer tela)

- [ ] **12.1 — Confirmações bonitas** — ao excluir algo (fatura, lançamento), aparece um **modal** de confirmação (não mais o pop-up cinza do navegador).
- [ ] **12.2 — Loading sem "piscar R$ 0"** — ao abrir as telas, aparece um **esqueleto/carregando** antes dos números (não mostra R$ 0 e depois pula pro valor).
- [ ] **12.3 — Extratos export** — em **Extratos (OFX)**, se houver transações, tem botão **Excel**/**CSV**. *(Hoje pode estar vazio — sem extrato importado.)*

---

## 🧪 13. Testes automatizados (opcional, no terminal)

- [ ] **13.1 — Rodar a suíte**
  - Como: no terminal do projeto, rode `npm run test:run`.
  - Esperado: **34 testes passando** (a matemática de dinheiro: sinal do cartão, parsers OFX, valores BR/US).

---

## 🎛️ 14. Ações que são SUAS (no painel, não no app)

Não são "testes", são 3 toggles que só você pode ligar:
- [ ] **Leaked Password Protection** — Supabase → Authentication → Policies → ativar "Prevent use of leaked passwords".
- [ ] **PITR (backup point-in-time)** — Supabase → Database → Backups → confirmar/ligar.
- [ ] **Separar o Preview da Vercel do banco de produção** — hoje o preview usa o banco real (Supabase branching ou um projeto de staging).

---

### 📌 Trabalho contábil (não é teste, mas é o que destrava a DRE)
Classificar os **587 lançamentos + 912 cartões** sem Plano de Contas (o alerta da DRE te mostra o quanto e onde). Conforme classifica, a DRE vai ficando completa.
