# categorizador-fatura ("RB7 Financeiro")

App financeiro da RB7 **em produção** (Vercel: categorizador-fatura.vercel.app).
Supabase ref `qdnqghefwjpeiidjlzjy` (org Pro), **dados reais** — faturas Sicoob
da Lívia (519 transações categorizadas) e ~13 mil vendas Hotmart.
**Cuidado: todo dado aqui é real. Não há staging — o preview da Vercel usa o
MESMO banco de produção.**

## O que o app é (unificação concluída em 2026-06-10)

A unificação com o rb7-financeiro (aposentado e deletado) foi **concluída**:
app TypeScript (React 19 + Tailwind 4 + react-router 7 + Vite/rolldown)
substituiu o App.jsx monolítico. Telas: Dashboard (híbrido cartão+financeiro),
Faturas de Cartão (import OFX + export CSV/XLSX),
Compras (anotações pendentes por mês), Contas a Pagar/Receber (`entries`),
Extratos OFX (`bank_transactions`), Hotmart (sync via API + cron diário),
Contas & Cartões (`accounts`).

Fonte da verdade do schema: banco vivo + `supabase/migrations/` (baseline
registrado sem execução + migrations aplicadas; status de cada uma no
runbook `supabase/MIGRATIONS.md`). Mapas históricos da portagem em
`docs/fase2/` e `supabase/audit/`.

## Regras do projeto

- **Nenhuma migration/mutação em nuvem sem o Luiz revisar o SQL e aprovar.**
- Rito de migration: arquivo com version placeholder → `apply_migration` via
  MCP → `list_migrations` dá o version real → renomear o arquivo → anotar
  "APLICADA" no header.
- MCP `supabase` (project scope) pinado em `.mcp.json` — autenticar via `/mcp`;
  se o projeto trocar de org, refazer o OAuth.

## Invariantes e decisões de design (não "corrigir" sem decisão nova)

- **`transactions.fit_id` NÃO é chave de dedupe**: o Sicoob deriva FITID de
  data+valor — parcelamentos repetem fit_id entre faturas (R$ 22.475,33
  legítimos). Por isso a "Fase 4" (migrar transactions→bank_transactions) foi
  **descartada**: cartão (`invoices`/`transactions`) e extrato bancário
  (`bank_transactions`, com `UNIQUE(account_id, fit_id)`) são fluxos separados
  por design.
- **Categoria foi REMOVIDA do app** (2026-06-25, migration `remove_categorias`):
  a classificação financeira é só Plano de Contas (`chart_of_accounts`) +
  Produto DRE (`dre_products`). Sumiram as tabelas `categories`/`auto_rules`/
  `purchase_item_categories`, as colunas `*.category`/`category_id`/
  `auto_categorized`, a auto-categorização do cartão e as telas Categorias e
  Relatório de Categorias. `transactions.date` é texto 'DD/MM/YYYY'; `amount` é
  sempre positivo (magnitude) e `transactions.kind` ('debit'/'credit') dá o
  sinal contábil: débito = despesa (soma), crédito = estorno/desconto (abate).
  O parser de cartão (`lib/fatura.ts`) classifica pelo TRNTYPE do OFX e
  **descarta o pagamento da fatura anterior** (CREDIT com memo `/PAGAMENTO|BOLETO/`,
  que se anula com a linha "FATURA ANTERIOR"). Total/dashboards/export usam o
  helper `valorComSinal()` — fonte única do sinal (decisão de 2026-06-22,
  desvia do contrato #3 que descartava todo crédito). Faturas importadas ANTES
  dessa data têm `kind='debit'` no backfill e total inflado pelos créditos
  ignorados — só reimportar corrige. **Cartão agora ENTRA na DRE**: a coluna
  `transactions.chart_of_account_id` (seletor "Plano de Contas" na aba Lançamentos
  da Fatura) classifica cada lançamento, e `dre_by_competency` une essas
  transactions aos entries — competência = data da compra, empresa via
  fatura→conta, sinal pelo `kind`. Anti-dupla-contagem: a DRE exclui entries de
  fatura agregada (`invoice_account_id`). NÃO entra na `dre_by_product` (cartão
  sem produto) nem na conciliação de caixa.
- **RLS = modelo de EQUIPE**: `using (true) with check (true)` para
  authenticated em todas as tabelas (Fase 1b/1c). Os ~11 WARNs
  `rls_policy_always_true` dos advisors são **aceitos por design**.
  Pré-condição do modelo: signup público e anonymous sign-ins DESLIGADOS
  (contas só via dashboard → Add user). `user_id`/`created_by` não são
  autoritativos.
- FKs de dados usam `ON DELETE RESTRICT` (registro financeiro não morre por
  arrasto; deletar usuário/conta com dados falha); vínculos fracos usam
  SET NULL.
- Funções novas: `set search_path = ''` sempre; RPCs precisam de
  `GRANT EXECUTE ... TO authenticated` explícito (default privileges foram
  revogados na Fase 1a). Extensões novas: `WITH SCHEMA extensions`.
- **PostgREST limita respostas a 1000 linhas** — somas/agregações vão pro
  banco (ex.: RPC `hotmart_totals`), nunca pro cliente.

## Hotmart (integração viva)

- Edge Function **`hotmart-sync`** (verify_jwt=false): modo-usuário (JWT +
  RLS, botão na tela) e modo-serviço (header `x-service-auth` == secret
  `HOTMART_SYNC_SERVICE_KEY` → escreve com a service key). Secrets
  `HOTMART_CLIENT_ID`/`HOTMART_CLIENT_SECRET` no env da function. Modos:
  `{debug:true}` (1ª venda crua+mapeada sem gravar), `{refresh_status:N}`
  (só serviço: re-checa N vendas por `?transaction=<id>` p/ capturar estorno),
  `{refresh_commissions:N}` (só serviço: preenche afiliado/coprodução/líquido
  exato via `/sales/commissions`) e `{refresh_sck:N}` (só serviço: backfill do
  `sck` via `purchase.tracking.source_sck`, UPDATE não-destrutivo).
- **Crons** (pg_cron, lendo o segredo do **Vault** `hotmart_service_key` via
  `net.http_post`, timeout 120s): `hotmart-sync-diario` (09:00 UTC, descoberta
  de vendas novas, janela 1 mês), `hotmart-refresh-status-diario` (09:30 UTC,
  refresh de estorno, rodízio por `status_checked_at`, ~200/dia) e
  `hotmart-commissions-diario` (09:45 UTC, **por último**, preenche afiliado/
  coprodução/líquido exato via modo `refresh_commissions=400`, rodízio por
  `commission_checked_at` + re-checa a janela recente ~35d que o sync regrava).
- **`sck` e `afiliado` (atribuição de vendedor) — hoje via modelo de canais (ver "Origem da
  venda" abaixo)**: a API `/sales/history` traz `purchase.tracking.source_sck` (NÃO `sck`) →
  `mapSale` grava em `hotmart_sales.sck`. Valor ruidoso: visitor-id (`<ts>_<id>`) / UTM (`a|b|c`)
  **ou** código fixo de vendedor (`raphaella_silva`, `maikom_vinicius`, `luiz_otavio`…, com
  variantes de grafia). O `affiliate` (nome canônico da Hotmart, ex. "Raphaela Silva") e o `sck`
  ("raphaella_silva") são a **MESMA pessoa** com grafias diferentes. `sellers` (cadastro) é mantido;
  a atribuição de vendedor agora é **por regras de propagação** (tela `/regras`, condições por
  src/sck/xcode/afiliado → `hotmart_sale_class.seller_id`) — ver "Origem da venda" abaixo. Backfill do sck por `refresh_sck`
  (cron temporário auto-terminável); vendas novas pegam sck pelo sync diário. ⚠️ As tabelas de de-para
  `hotmart_sck_map`/`hotmart_affiliate_map` (v1) e `origin_tracking_map` (v2) foram **REMOVIDAS** (2026-06-29).
- **Tracking extra `src`/`external_code`**: `mapSale` grava `hotmart_sales.src`
  (=`tracking.source`) e `external_code` (=`tracking.external_code`) — origem/
  campanha, **NÃO carregam vendedor** (só o `sck` carrega; `xcode` a API não
  traz, é webhook-only). `refresh_sck` preenche os 3 (sck+src+external_code) do
  MESMO tracking num passe só.
- **Mapeamento de valores validado contra dados reais (2026-06-11), ver
  [[hotmart-mapeamento-campos]]**: `total_amount`=`purchase.price.value`
  (VALOR TOTAL pago, **inclui juros de parcelamento**); `gross_amount`=
  **`purchase.hotmart_fee.base`** (BRUTO, preço do produto sem juros —
  `price.base` NÃO existe); taxa=`purchase.hotmart_fee.total`; líquido=bruto−taxa (aproximado no
  `mapSale`). ~37,5% das vendas são parceladas. **Afiliado/coprodução e o
  líquido EXATO vêm de OUTRO endpoint**: `/sales/commissions?transaction=<id>`
  (`items[0].commissions[]` = `{source, commission.value, user.name}`, source
  AFFILIATE/PRODUCER/COPRODUCER; ver [[hotmart-sales-commissions-shape]]). O modo
  `refresh_commissions` da edge function (dirigido pelo banco, rodízio por
  `commission_checked_at`) preenche `affiliate`/`affiliate_commission`/
  `coproducer`/`coproduction_commission`/`net_amount` (= PRODUCER) — e por isso
  o `mapSale` do sync diário NÃO emite essas 4 colunas (defaults 0/NULL as cobrem),
  só `net_amount` aproximado. Total por afiliado: RPC `hotmart_by_affiliate`.
- **Moeda**: coluna `currency` (`price.currency_code`); a base tem vendas USD/
  EUR/PYG/etc. A RPC `hotmart_totals` filtra `currency='BRL'` (default) e
  devolve `fora_moeda` (nº excluído) — **nunca somar moedas diferentes** (5
  vendas PYG já chegaram a inflar o "Bruto" em ~R$8,7M antes do filtro).
- **`status` cru em inglês** (COMPLETE/APPROVED/REFUNDED...); a busca por janela
  de data OMITE estornos (por isso o cron de refresh por transação). A allowlist
  de receita (regex PT+EN) vive em `hotmart_totals` e em `lib/hotmart.ts`.
- Upsert MERGE por `transaction_code` (reimport/sync atualiza status —
  reembolso/chargeback refletem).
- **Webhook 2.0 em tempo real** (no repo desde 2026-06-26; **pendente de ativação**
  — migrations a aplicar + deploy + secret `HOTMART_HOTTOK` + cadastro no painel
  Hotmart): Edge Function **`hotmart-webhook`** (`verify_jwt=false`) valida o
  `hottok` (header `x-hotmart-hottok`, tempo constante) → grava o evento CRU
  durável em `hotmart_webhook_events` (service-only, PII; `dedupe_key` UNIQUE
  nunca-NULL) → deriva inline pra `hotmart_sales` via RPC `apply_hotmart_webhook_event`
  → responde **200 assim que durável**. **Divergência consciente** do
  `docs/HOTMART-REFERENCIA.md` §2.5.8 ("falha pós-cru → 5xx"): só devolve 5xx se o
  persist do CRU falhar — falha de derivação fica em `process_error` e o cron
  `hotmart-webhook-drain` (1 min, SQL puro, `drain_hotmart_webhook_events`)
  reprocessa; motivo: 5xx em 5 reentregas faz a Hotmart **auto-desativar** a config.
  Tripla rede: inline → drain → crons da API. **Anti-regressão de estorno por
  TRIGGER** `trg_hotmart_status_guard` (congela REFUNDED/CHARGEBACK contra QUALQUER
  writer — webhook, sync e `refresh_status`); status canônico vem do `event`
  (`hotmart_canonical_status`), nunca do default PT `'aprovada'`; ordem por
  `webhook_event_at` (newest-wins). Patch **não-destrutivo** (refund chega sem
  `origin`/`buyer`/`price`); financeiro só quando há `price`; comissões seguem donas
  do `refresh_commissions`. Captura o **`xcode`** (coluna nova `hotmart_sales.xcod`)
  que a API não traz. A tela **`/hotmart`** atualiza sozinha via Supabase **Realtime**
  (`hotmart_sales` na publication; hook `src/hooks/useRealtimeRefetch.ts` →
  `carregar()` debounced). Os ~24 WARNs do lint não sobem (o `setState` do hook é
  assíncrono). Pegadinhas-fonte em `docs/HOTMART-REFERENCIA.md` §2.4.
- **Origem da venda — classificação automática por REGRAS de propagação** (modelo v4, 2026-06-29):
  a origem (Grupo + Vendedor) é definida por **regras** em `origin_tracking_rules`, não mais venda a
  venda. Cada regra = **condições AND opcionais por campo** (`src`/`sck`/`xcode`/`afiliado`), cada campo
  com um **tipo de match** (`exact`/`contains`/`starts_with`/`is_empty`) + um **destino**
  (`group_id`, `seller_id`). A regra casa quando TODOS os campos preenchidos coincidem; mais condições
  preenchidas = mais específica = vence (precedência por contagem). As RPCs aplicam o destino em
  **`hotmart_sale_class`** (`transaction_code → group_id/channel_id/seller_id`): `apply_origin_rules()`
  (só classifica vendas AINDA sem grupo — não sobrescreve) e `force_apply_origin_rule(uuid)` (re-aplica
  UMA regra a TODAS as vendas que casam — chamada ao salvar edição). **Grupo** (`origin_groups`) é
  lista que o Luiz cria (inline pelo "+ Novo grupo..." do select); **Vendedor** = `sellers`. Migrations
  (todas APLICADAS, mesmo dia): `origem_rules_add_afiliado` (`20260629160459`),
  `origem_rules_multi_condition` (`20260629161019`, troca o par (field,value) por 4 colunas
  `*_value`), `origem_rules_match_type` (`20260629163109`, colunas `*_match` ILIKE),
  `origem_rules_is_empty_match` (`20260629163852`).
  - **Tela `/regras`** ("Regras de origem", grupo Receitas & Vendas, ícone `Filter`): regras em
    **ABAS por grupo** (uma aba por `origin_groups` + "Sem grupo" se houver regra com `group_id` null;
    aba efetiva derivada, sem effect). A aba de um grupo que **tem vendedores** (Comercial) sub-agrupa
    **por vendedor** — card/acordeão por seller ativo (todos aparecem, mesmo sem regra, pra adicionar),
    com "+ adicionar condição" já preenchendo grupo+vendedor; regras sem vendedor nesse grupo caem num
    card "Sem vendedor". As demais abas (Tráfego Pago, Orgânico, ...) **listam as condições direto**, sem
    vendedor (chips + Editar/Excluir + "+ adicionar condição"). Heurística da aba: mostra por-vendedor
    se alguma regra do grupo tem `seller_id`. Botão **"+ Novo grupo"** (cria aba) e **"Aplicar agora"**
    (`apply_origin_rules`). Criar grupo pelo modal (renderizado DEPOIS do modal de regra pra ficar por
    cima — ambos `z-50`). Sellers carregados só com `active=true`.
    - **Rafa Brito tirado do rol de vendedores** (2026-06-29, é o dono da empresa, não vendedor): UPDATE
      não-destrutivo `seller_id=null` nas 12 regras de marketing dele E nas ~9,4 mil vendas em
      `hotmart_sale_class` (o **grupo** Orgânico/Tráfego/Sem Grupo permanece — só perde a pessoa) +
      `sellers.active=false` (reversível, não deletado). Modelo confirmado: Comercial = com vendedor; o
      resto (marketing) = sem vendedor.
  - Origem **derivada ao vivo** pela view `hotmart_sales_origin` (`security_invoker`, SEM coluna em
    hotmart_sales): expõe `origem` (=**nome livre do grupo** marcado, senão `a_classificar`), `canal`,
    `vendedor` + os ids. RPCs que lêem a view: `hotmart_by_group` (grupo, vendas, bruto, total,
    liquido), `hotmart_seller_report` (por `hotmart_sale_class.seller_id`), `hotmart_by_affiliate`.
  - **`/origem` foi REMOVIDA e consolidada em `/hotmart`** (a classificação saiu pra `/regras`, então a
    tela virou tabela read-only duplicada): `/hotmart` mostra a tabela de vendas com colunas
    **Grupo + Vendedor** (a coluna Canal saiu — virou órfã), **busca** server-side (produto/src/sck/
    xcode/afiliado/grupo/vendedor/código, debounce 400ms), pills **Todas/A classificar/Classificadas**,
    faixa de **KPIs por grupo** e card **"Total por grupo"** (`hotmart_by_group`, no lugar do antigo
    "Total por canal"). Carregamento separado: `carregarVendas` (empresa+período+filtro+busca) vs
    `carregarTotais` (só empresa+período) pra não piscar KPIs ao digitar. `OrigemBadge` dá **cor por
    heurística do nome do grupo** (org→verde, tráfego→âmbar, comercial→azul, resto neutro) — NÃO mapa
    fixo, porque os grupos têm nome livre. `/vendedores` = cadastro + relatório (`hotmart_seller_report`).
  - **CANAL removido da UI** (2026-06-29): `origin_channels`/`channel_id` ainda existem no banco mas
    **fora de toda tela** (regras e tabelas só lidam com Grupo + Vendedor). `hotmart_by_channel` segue
    no banco mas **sem uso na UI**. Trocar grupo não mexe mais em canal.
  - **Histórico (tudo 2026-06-29):** v1 (`hotmart_origin_map`+`hotmart_sck_map`+`hotmart_affiliate_map`)
    → v2 (canais 2 níveis + de-para `origin_tracking_map` + `origin_sale_override`) → **v3**
    (classificação manual POR VENDA com 3 selects inline em `/origem`, migration
    `origem_classificacao_por_venda` `20260629150351`) → **v4** (regras de propagação, atual). Removidos
    ao longo do caminho: as 3 tabelas v1, `origin_tracking_map`, `origin_sale_override`,
    `origin_channels.grupo`(enum)/`seller_id`, a tela `/origem`, e várias RPCs antigas
    (`hotmart_channels`/`scks`/`affiliates`/`by_origin`/`by_seller`/`by_person`/`origin_channels_list`/
    `origin_tracking_unmapped`). Mantidos sem uso: utils `hotmart_canal_base`/`hotmart_origin_suggest`.
    ⚠️ Dados de origem foram **ZERADOS** na transição v3 (os 7 `sellers` preservados) — origem começou
    **100% `a_classificar`** e vai sendo preenchida pelas regras. **Modelo ainda em alinhamento com o
    Luiz** — pode evoluir.

## Convenções

- **Design system "Razão Calma"** (redesign 2026-06-24): tokens semânticos em
  `src/index.css` via `@theme` do Tailwind 4 — **cor só com função**: `bg-brand`/
  `text-brand` (ação, azul cobalto), `text-revenue`/`bg-revenue-bg` (entrada,
  verde), `text-expense`/`bg-expense-bg` (saída/atraso, vinho), `text-warning`/
  `bg-warning-bg` (pendente/alerta, âmbar); estrutura em `canvas`/`surface`/
  `surface-2`/`border`/`border-strong`/`fg`/`fg-muted`/`fg-subtle`. Mais
  `--radius-control/card/modal`, `--shadow-card/pop` e `@utility tnum` (números
  tabulares em TODO valor financeiro). Fontes **Geist + Geist Mono**
  (`@fontsource-variable/*`, importadas no `main.tsx`; a Mono é a assinatura dos
  números do hero). **Não usar mais `slate-`/`indigo-`/`green-`/`red-`/`amber-`
  cru — usar os tokens.** Primitivos novos em `src/components/ui.tsx`: `KPICard`/
  `KPIStrip` (faixa de KPIs), `Button` (primary/secondary/danger/ghost), `Alert`
  (info/success/warning/danger), `Badge`/`StatusBadge` por `tom` semântico — o
  `Badge cor={hex}` legado segue **só** p/ identidade de natureza (preservar). `btnPrimario`/`btnSecundario` viraram alias-string tokenizados.
  Sidebar (`Layout.tsx`) clara, 7 grupos por domínio. **Gotcha Tailwind 4:** um
  `*/` dentro de comentário no `index.css` fecha o comentário cedo e derruba o
  `@theme` inteiro (silencioso, sem erro óbvio) — nunca escrever `bg-*/text-*`
  em comentário.
- Env: `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (chaves novas
  `sb_publishable_`/`sb_secret_`; as JWT legadas estão **desabilitadas** — não
  reativar). `.env.example` na raiz.
- `npm run dev` → localhost:5173 · `npm run build` (tsc strict + vite) ·
  `npm run lint` (0 errors; os 23 warnings conscientes = 21 fetch-on-mount + 2 da
  DataTable: o load-on-mount do useColumnPrefs e o react-compiler "incompatible
  library" das libs de tabela — ver eslint.config.js). Cada página nova com o
  padrão `useEffect(() => { carregar() }, [carregar])` soma 1 fetch-on-mount (a
  tela Transferências somou +1 em 2026-06-25; a remoção de categoria havia
  derrubado 3 no mesmo dia).
- `xlsx` vem do tarball oficial do SheetJS (cdn.sheetjs.com) — o pacote do npm
  está abandonado com CVE; não trocar de volta.
- PowerShell 5.1: mensagem de `git commit` via here-string `@'...'@` **não
  pode conter aspas duplas** (re-tokenização quebra o comando nativo).
- O "mundo fatura" (src/components/fatura/, Faturas, Fatura) foi **padronizado
  no design system** (Tailwind + `ui.tsx` + `DataTable` + `Modal`; estilos inline
  e o `estilos.ts`/objeto `S` foram removidos — 2026-06-19). Os 15 contratos de
  `docs/fase2/contratos-app-antigo.md` são preservados no **comportamento/dados**
  (parser OFX, `fit_id` não-dedupe, fluxo de pendentes, export filtrados-vs-todos,
  texto exato do confirm de excluir fatura, reimport duplica); os contratos de
  categoria (#4 auto-categorização, #9 coluna Categoria no export, #13 filtro por
  categoria) foram **aposentados** com a remoção de categoria (2026-06-25). A
  **fidelidade visual 1:1 deixou de ser regra** — o visual segue o resto do app.
- **Tabelas reordenáveis/redimensionáveis/ocultáveis**: `src/components/DataTable.tsx`
  (TanStack Table v8 headless + @dnd-kit pro arrastar do header) + hook
  `src/hooks/useColumnPrefs.ts` (cacheia em localStorage, persiste em
  `user_table_prefs` por usuário, debounce 600ms). A página só descreve
  `DataColumn<T>[]` (id/header/cell/size/align). Em uso: Hotmart, Contas a
  Pagar/Receber (`lancamentos:${tipo}`), Extratos, Usuários e **Lançamentos da
  fatura** (`fatura-lancamentos`). Handlers usados em `cell` precisam de
  `useCallback` (senão a memo das colunas recria toda render → warn
  exhaustive-deps); em `Fatura.tsx` o `addCategoria` do hook (não estável) é
  acessado via `ref` pra manter a memo limpa. **A tabela de Compras
  (`PurchaseItemsTab`) NÃO usa o DataTable** — tem edição inline on-blur, então
  fica num `<table>` Tailwind com SÓ o menu "esconder coluna"
  (`src/components/ColumnVisibilityMenu.tsx`, agora em Tailwind, reusa o
  `columnVisibility` do `useColumnPrefs`). **Largura: "ajuste à tela" (fit) fixo**
  — cabe tudo sem scroll: colunas de número/data ficam no tamanho natural (NUNCA
  truncam) e só as de TEXTO encolhem/truncam ("…"). A heurística texto-vs-rígida
  é "alinhada à esquerda E size≥140"; a página pode forçar via `DataColumn.grow`.
  Quando nem o texto no mínimo cabe (tela estreita), a tabela rola na horizontal
  — scroll horizontal **nativo** (rodinha normal desce a página, Shift+rodinha
  rola na horizontal) + sombra na borda direita (rede de segurança, sem botão).
  (A conversão rodinha-vertical→horizontal-sem-shift foi **removida** a pedido do
  Luiz — ela "roubava" o scroll vertical da página.) Corpo das células 13px.
  (Houve um toggle fit↔natural; removido a pedido do Luiz — fit é sempre.)
  **Paginação opcional** via prop `pageSize` (TanStack `getPaginationRowModel`):
  renderiza só `pageSize` linhas/página + controles Anterior/Próxima — usada no
  `/hotmart` (`pageSize=50`) pra não travar com 1000 linhas no DOM.
