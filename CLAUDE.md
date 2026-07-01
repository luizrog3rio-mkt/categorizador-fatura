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
- **DRE por competência inclui Hotmart (auditoria 2026-06-30, migration
  `dre_competencia_inclui_hotmart` `20260630110613`):** a `dre_by_competency` (tela DRE
  principal) mostrava Receita Bruta R$0 pra todo o grupo — lia só `entries`+cartão e a
  receita do grupo é 100% Hotmart (prejuízo fabricado de milhões). Fix: 3 linhas sintéticas
  de Hotmart por mês (bruto→receita, taxa→dedução, comissões→custo variável), filtro
  empresa+BRL+aprovado; sem dupla contagem (Hotmart não está em entries). **Hotmart agora
  entra nas DUAS DREs** (revoga a regra antiga "só na produto"); a competência ainda tem
  cartão a mais. ✅ **`entries`/`transactions` SEM `chart_of_account_id` NÃO somem mais da DRE**
  (migration `dre_competencia_a_classificar` `20260701033821`, auditoria 2026-06-30): antes o INNER
  JOIN os engolia — a RB7 DIGITAL mostrava a receita Hotmart mas omitia **~R$3,5M de despesas
  não-classificadas** (lucro fictício, inflado). Agora a `dre_by_competency` emite 2 linhas
  sintéticas **"(A classificar)"** espelhando o HOT-1: **NC-2 "(Despesas a classificar)"**
  (entries `payable` + cartão sem conta, `nature='variable_cost'` → aparece em Custos Variáveis) e
  **NC-1 "(Receitas a classificar)"** (entries `receivable` sem conta). A data dos entries passou a
  usar `coalesce(competency_date, issue_date, due_date)` (os 695 que só tinham `due_date` param de
  sumir). Sem mutação de dado (coalesce ao vivo); sem dupla-contagem (mov exige chart NOT NULL,
  naoclass exige NULL). O `naoclass` e o `dre_nao_classificado` também excluem `transfer_id`
  (migration `dre_exclui_transferencia_a_classificar` `20260701104248`, auditoria de 11 frentes
  2026-07-01): transferência é neutra (par que se anula, nasce com chart null) e nunca recebe conta —
  senão inflaria NC-1/NC-2 e o alerta nunca zeraria (latente, 0 transferências hoje). No front a perna
  de transferência é read-only na edição e pulada no bulk de Conta DRE. O frontend renderiza NC como as
  HOT (agrupa por natureza, sort_order alto → último da seção). **A DRE por PRODUTO (`DreProduto.tsx`)
  também mostra o Alert `dre_nao_classificado`** (mesma auditoria — antes só a por competência tinha).
  A tela DRE ainda mostra o Alert (aponta pro balde a
  esvaziar via a **ferramenta de classificação em massa** — decisão do Luiz "as duas", 2026-06-30). **Auditorias de
  2026-06-30 (import/consistência/resiliência) — JÁ CORRIGIDO:** 6 datas de ano-lixo (20226/20026
  etc.) → 2026 + `entries_datas_sanas` agora VALIDATE'd (retroativo); backfill de competency (18
  entries, +R$50k na DRE) e payment_date (149, +R$640k de datas, proxy=due_date); guarda de
  natureza no cartão da DRE (cartão = só custo, anti receita-fantasma); `closed_periods` agora
  ENFORÇADO por trigger `trg_bloqueia_periodo_fechado` (não só no front); `deletions_log` + trigger
  forense de DELETE em entries/invoices (tela `/delecoes`, RPC `listar_delecoes`) — **ampliado na
  auditoria de 11 frentes (2026-07-01, migration `auditoria_forense_hotmart_e_lockdown_logs`
  `20260701104204`) pra `hotmart_sales` (100% da receita) e `bank_transactions`** (antes um admin
  apagava venda sem rastro); os logs (`deletions_log`/`entry_audit_log`) tiveram INSERT/UPDATE/DELETE
  **revogados de authenticated** (imutabilidade não depende só da RLS — gravação é via trigger
  `security definer`; SELECT fica). Guard de OFX
  vazio na fatura + aviso de reimport-duplica; **primeira rede de TESTES** (vitest, `src/lib/*.test.ts`).
  As 4 réguas de resultado foram ROTULADAS (diferem por design, não unificadas); os itens de
  segurança foram fechados (ver bullet RLS/papel + seguranca_*).
- **DRE por produto — atribuição (migration `dre_product_link_chart_account`
  `20260630012653`):** o produto de cada linha vem de 3 fontes — Hotmart pelo mapa
  SKU→produto (`hotmart_product_map`, tela "Mapear produtos"); lançamentos manuais
  acima da margem por **`coalesce(entries.dre_product_id, chart_of_accounts.dre_product_id)`**
  (o produto **herda da conta do plano**; o seletor por lançamento é só override);
  abaixo da margem o produto é sempre NULL (nível empresa). A coluna nova
  **`chart_of_accounts.dre_product_id`** (FK→`dre_products`) é o vínculo conta→produto,
  editável no seletor "Produto DRE" do Plano de Contas. O flag legado
  `rateio_por_produto` era **morto** (nenhuma função/UI lia) → **reaproveitado** = "tem
  produto?" (derivado de `dre_product_id is not null` no save). Quem fica sem produto cai
  em "(A classificar)". `dre_by_product` é `security invoker`.
- **DRE por COMPETÊNCIA — receita Hotmart dividida pelas contas do plano (2026-06-30, pedido do
  Luiz):** antes a receita Hotmart era 1 linha sintética única ("Vendas Hotmart") e as contas de
  receita do plano (Mentorias/Cursos) ficavam vazias. Agora a `dre_by_competency` **divide o bruto
  Hotmart entre as contas de receita** pela cadeia **venda → `hotmart_product_map.product` →
  `coalesce(pm.chart_of_account_id, dre_products.chart_of_account_id)` → conta** (3ª união do CTE
  `mov`). **Dois níveis com prioridade:** (1) **mapa DIRETO** `hotmart_product_map.chart_of_account_id`
  (coluna "Conta de Receita (direto)" na tela **Mapear produtos**) — ganha; (2) **via Produto DRE**
  `dre_products.chart_of_account_id` (seletor "Conta de Receita" na tela **Produtos DRE**) — fallback.
  O bruto **não-mapeado** vira a linha sintética **"Vendas Hotmart (a classificar)"** (HOT-1, é o
  termômetro do que falta mapear); **taxa (HOT-2) e comissões (HOT-3) seguem agregadas** (deduções/
  custos nível-empresa, NÃO dividem por conta). Total sempre preservado (mapeado + a-classificar =
  bruto). Migrations: `dre_products_chart_of_account` (`20260630202547`),
  `dre_competencia_split_hotmart_por_conta` (`20260630202639`), `hotmart_product_map_chart_account_direto`
  (`20260630204421`), `dre_competencia_hotmart_conta_direta` (`20260630204455`). Direção: o plano
  granular (1 conta/curso) usa o mapa direto; categorias coarse usam o via-Produto-DRE. **Só afeta a
  DRE por competência** — a `dre_by_product` (por produto) é independente. ⚠️ O `mov` do cartão tem
  guarda de natureza de custo (`dre_competencia_guarda_natureza_cartao` `20260630190014`).
- **RLS = LEITURA de equipe + ESCRITA de admin** (migration `seguranca_viewer_readonly_real`
  `20260701021714`, decisão do Luiz 2026-06-30 — o papel `viewer` virou limite REAL, não mais
  só-UI): **SELECT** continua `using (true)` para authenticated em todas as tabelas (leitura de
  equipe, os WARNs `rls_policy_always_true` do SELECT seguem aceitos por design), mas
  **INSERT/UPDATE/DELETE** das 15 tabelas de dados + `closed_periods` exigem **`(select public.is_admin())`**
  (função `security definer` que lê `profiles.role='admin'` do caller; WARN de definer-executável
  por authenticated **aceito** — só revela o próprio papel). Exceções que continuam owner-scoped:
  `user_table_prefs` (prefs de coluna — viewer PRECISA salvar) e o self-update de `profiles` (menos
  a coluna role). **Motor de origem:** `reapply_all` teve o EXECUTE revogado de authenticated e os
  wrappers `apply_origin_rules`/`force_apply_origin_rule` ganharam guard `is_admin()` (o auto-classify
  de venda nova usa `apply_origin_rules_one`, só service_role → intocado). **Serviço** (sync/webhook/
  crons via service key) **bypassa RLS** → intocado. Os 4 usuários são admin; `viewer` fica de fato
  só-leitura no banco (provado por teste: viewer INSERT → RLS violation, admin → OK). ⚠️ **A trava da
  coluna `role`** (trigger `trg_guard_profile_role`, bloqueia authenticated/anon de mudar o próprio
  papel) é **defesa-em-profundidade**: a proteção REAL contra auto-promoção é `authenticated` **não ter
  UPDATE grant** em `profiles` (só SELECT/INSERT/DELETE; papel só muda via edge `user-management`,
  admin-gated). Pré-condição do modelo: signup público e anonymous sign-ins DESLIGADOS (contas só via
  dashboard → Add user). `user_id`/`created_by` não são autoritativos.
- FKs de dados usam `ON DELETE RESTRICT` (registro financeiro não morre por
  arrasto; deletar usuário/conta com dados falha); vínculos fracos usam
  SET NULL.
- **Intercompany é LEGÍTIMO por design (decisão do Luiz, 2026-06-30):** um `entries`
  cuja conta pagadora (`account_id`) é de OUTRA empresa que o `company_id` do lançamento
  (empresa A paga a conta de B) **não é bug** — é o modelo real da RB7 (ex.: 3 lançamentos
  do projeto CASAS ALFENAS, despesa da RB7 INCORPORADORA, pagos pela CONTA SICOOB da RB7
  DIGITAL, R$10.811,90). **NÃO adicionar guard rígido** (CHECK/trigger) barrando
  `account.company_id <> entries.company_id` — isso é a única forma de acertar DRE (fica na
  empresa dona do projeto) E conciliação de caixa (casa o extrato real da conta pagadora) ao
  mesmo tempo. Guard é **suave/visível**: a tela de Lançamentos marca cada um com Badge
  "intercompany" na coluna Empresa (mostra qual empresa pagou) + Alert com contagem/soma. O
  bulk-move-empresa (`aplicarEmpresaEmMassa`) é **não-destrutivo**: move e avisa se ficou
  intercompany, **nunca zera** a conta (o form individual ainda zera `account_id` ao trocar
  empresa — comportamento legado, não confundir). ⚠️ Há uma conta ESPELHO vazia "CONTA SICOOB
  - RB7 DIGITAL" sob a RB7 INCORPORADORA (id 45aa0e1b, 0 entries, nome duplicado da conta real
  d3ab8b2b sob a DIGITAL) — resquício de uma tentativa de modelar intercompany por espelho;
  os 3 do CASAS ALFENAS apontam pra conta REAL da DIGITAL, não pro espelho.
- Funções novas: `set search_path = ''` sempre; RPCs precisam de
  `GRANT EXECUTE ... TO authenticated` explícito (default privileges foram
  revogados na Fase 1a). Extensões novas: `WITH SCHEMA extensions`.
- **PostgREST limita respostas a 1000 linhas** — somas/agregações vão pro
  banco (ex.: RPC `hotmart_totals`), nunca pro cliente. Pra LISTAR mais de 1000 quando
  preciso, paginar por `.range(from, from+999)` em loop até a página vir incompleta
  (ex.: `carregarVendas` do `/hotmart` quando há filtro ativo busca TODAS as que casam,
  não só 1000 — com `.order` + tiebreaker `transaction_code` pra paginação estável, e a
  virtualização do DataTable aguenta renderizar os milhares). **Flag de truncamento silencioso
  (auditoria 2026-06-30):** listas que carregam SEM paginar e dependem do teto de 1000 avisam
  quando batem nele — Lançamentos seta `truncado` (`data.length >= 1000`) e mostra um Alert
  "mostrando só 1000, refine filtros" (totais/export também se limitam ao carregado). Extrato já
  fazia isso via `limit(300)` + `extrato_totais.qtd` (KPI "mostrando 300"). Fatura/Compras são
  limitados por natureza (por-fatura, pendentes) → sem flag.

## Hotmart (integração viva)

- Edge Function **`hotmart-sync`** (verify_jwt=false): modo-usuário (JWT +
  RLS, botão na tela) e modo-serviço (header `x-service-auth` == secret
  `HOTMART_SYNC_SERVICE_KEY` → escreve com a service key). Secrets
  `HOTMART_CLIENT_ID`/`HOTMART_CLIENT_SECRET` no env da function. ⚠️ **Ao deployar
  pelo MCP `deploy_edge_function`, SEMPRE passar `verify_jwt: false`** — o default
  do tool é `true` e os crons chamam via `x-service-auth` SEM JWT (true quebraria os
  3 crons no gate da plataforma). Vale pra `hotmart-sync` e `hotmart-webhook`. Modos:
  `{debug:true}` (1ª venda crua+mapeada sem gravar), `{refresh_status:N}`
  (só serviço: re-checa N vendas por `?transaction=<id>` p/ capturar estorno; opcional
  `all_history:true` ignora a janela de 200d p/ backfill histórico — auditoria 2026-06-30
  mediu taxa de estorno >200d = 0% numa amostra de 100, full backfill descartado),
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
  ⚠️ **Invariante das janelas (auditoria 2026-06-30, verificado ALINHADO):** o sync diário passa
  `months:1` (regrava **30d**) e o commissions re-checa **35d** → 35 ≥ 30, cobre com 5d de margem.
  O status re-checa 200d. Se algum dia o sync mudar pra `months:2` (60d), o commissions (35d)
  deixa de cobrir o pedaço 35–60d — bump o `recente` no edge junto. (Hoje o risco é baixo: o fix
  do `net_amount` fez o `mapSale` NÃO emitir mais comissão/net, então o sync não re-clobbra o que
  o commissions grava — o re-check só acelera capturar comissão nova.)
- **Observabilidade de edge (auditoria 11 frentes P9, migration `cron_edge_audit_observabilidade`
  `20260701110740`):** o `succeeded` do pg_cron só diz que o `net.http_post` ENFILEIROU — o status
  HTTP real da edge vive em `net._http_response`, purgado pelo pg_net em ~6h. Cron **`snapshot-edge-
  responses`** (horário) copia essas respostas pra tabela durável **`cron_edge_audit`** (equipe lê;
  gravação via `snapshot_cron_edge_responses()` definer, EXECUTE revogado). Como só os 3 crons Hotmart
  usam `net.http_post`, toda resposta ali é edge nossa → passa a ter histórico do status HTTP (hoje só
  200). O `hotmart_cron_health` (front, tela `/hotmart`) segue sendo o alerta de estagnação.
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
  `coproducer`/`coproduction_commission`/`net_amount` — e por isso
  o `mapSale` do sync diário NÃO emite essas colunas (defaults 0/NULL as cobrem).
  ⚠️ **`net_amount` (líquido) é DONO EXCLUSIVO do `refresh_commissions`** (auditoria
  2026-06-30 + edge v24): o `mapSale` NÃO emite mais `net_amount` (coluna tem `default 0`;
  venda nova = 0 até a cron) — antes emitia `bruto−taxa` e **re-clobbrava** o líquido correto
  das vendas com afiliado (~145 vendas / R$20,7k infladas — o afiliado SAI do pagamento do
  produtor, confirmado: PRODUCER = bruto−taxa−afiliado−coprodução). O `refresh_commissions`
  agora grava `net_amount = PRODUCER` quando vem, **senão a fórmula `bruto−taxa−afi−cop`**
  (idênticos p/ RB7, validado por inspeção da API), e SÓ quando o array de comissões vem
  não-vazio (resposta vazia transitória só marca `commission_checked_at`, não zera). Modo
  **`inspect_commissions:[codes]`** (só serviço, READ-ONLY): devolve o breakdown cru da API +
  o do banco, sem gravar — pra auditar o líquido. Total por afiliado: RPC `hotmart_by_affiliate`.
- **Moeda**: coluna `currency` (`price.currency_code`); a base tem vendas USD/
  EUR/PYG/etc. A RPC `hotmart_totals` filtra `currency='BRL'` (default) e
  devolve `fora_moeda` (nº excluído) — **nunca somar moedas diferentes** (5
  vendas PYG já chegaram a inflar o "Bruto" em ~R$8,7M antes do filtro).
- **`status` cru em inglês** (COMPLETE/APPROVED/REFUNDED...); a busca por janela
  de data OMITE estornos (por isso o cron de refresh por transação). A allowlist
  de receita (regex PT+EN) vive em `hotmart_totals` e em `lib/hotmart.ts`.
- Upsert MERGE por `transaction_code` (reimport/sync atualiza status —
  reembolso/chargeback refletem). ⚠️ **`company_id` é CONGELADO** (auditoria 2026-06-30, trigger
  `trg_congela_company_hotmart` `20260630212201`): definido no 1º INSERT, NÃO muda por re-sync/
  import/webhook (antes o upsert re-atribuía a empresa → 38 vendas pararam no "RAFAEL BRITO" por
  engano, corrigidas). Há **uma só conta Hotmart** → tudo é RB7 DIGITAL (alvo do cron). A tela
  `/hotmart` NÃO tem mais seletor "Empresa de destino": sync/import gravam na **EMPRESA global**
  (desabilitados em "Consolidado"). Pra mover venda entre empresas na mão (raro): `set local
  app.permite_trocar_empresa_hotmart = 'on'` antes do UPDATE (escape do trigger).
- **Webhook 2.0 em tempo real** (no repo desde 2026-06-26; **ATIVO em produção
  desde 2026-06-26** — `HOTMART_HOTTOK` configurado, cadastrado no painel Hotmart,
  recebendo eventos reais; verificado na auditoria 2026-06-30: 305 eventos
  recebidos — PURCHASE_COMPLETE/APPROVED/REFUNDED/CANCELED + SUBSCRIPTION_CANCELLATION
  — e os 23 PURCHASE_REFUNDED já refletidos como REFUNDED/CHARGEBACK em
  `hotmart_sales`; derivação inline + drain operando com 0 falhas. **NÃO re-ativar**
  — recadastrar/trocar hottok/redeploy só quebra ou duplica entregas):
  Edge Function **`hotmart-webhook`** (`verify_jwt=false`) valida o
  `hottok` (header `x-hotmart-hottok`, tempo constante) → grava o evento CRU
  durável em `hotmart_webhook_events` (service-only, PII; `dedupe_key` UNIQUE
  nunca-NULL) → deriva inline pra `hotmart_sales` via RPC `apply_hotmart_webhook_event`
  → responde **200 assim que durável**. **Divergência consciente** do
  `docs/HOTMART-REFERENCIA.md` §2.5.8 ("falha pós-cru → 5xx"): só devolve 5xx se o
  persist do CRU falhar — falha de derivação fica em `process_error` e o cron
  `hotmart-webhook-drain` (1 min, SQL puro, `drain_hotmart_webhook_events`)
  reprocessa; motivo: 5xx em 5 reentregas faz a Hotmart **auto-desativar** a config.
  ⚠️ **`process_error` = SÓ falha real** (migration `webhook_skip_nao_e_erro` `20260701034823`,
  auditoria 2026-06-30): um `SUBSCRIPTION_CANCELLATION` (e qualquer evento sem `transaction_code`)
  é um **skip legítimo** — não vira linha em `hotmart_sales`. Antes o `apply_hotmart_webhook_event`
  gravava esse skip no `process_error` → 9 eventos "com erro" que não eram falha (escondiam um erro
  DE VERDADE no meio; o drain não os re-tenta, `processed_at` já setado). Agora o branch `v_tx is
  null` só dá `return` (o tipo fica em `event`). Monitorar por `process_error is not null` = falhas
  reais (hoje 0); "skip" = `processed_at not null and transaction_code is null`.
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
  preenchidas = mais específica = vence. O destino vai pra **`hotmart_sale_class`**
  (`transaction_code → group_id/seller_id` + proveniência `source` `manual`/`rule` e `applied_by_rule`).
  **Motor blindado (Fase 5, migrations `origem_sale_class_proveniencia` `20260629214649` +
  `origem_reapply_all` `20260629214724`):** a fonte da verdade é **`reapply_all()`** — recomputa o
  universo do zero por **precedência determinística** (mais específica → mais antiga por `created_at`),
  **preserva `source='manual'`** (regra NUNCA clobbera trabalho à mão) e **elimina fantasmas/órfãos**
  (limpa as de regra e reinsere só o que casa hoje → **excluir regra devolve as vendas pro
  `a_classificar`**). `apply_origin_rules()` e `force_apply_origin_rule(uuid)` viram **wrappers** que
  chamam `reapply_all` (frontend chama os mesmos nomes; criar/editar/excluir regra dispara reapply
  global; `excluirRegra` chama o reapply após o delete). Blast radius da transição medido = 0.
  **Grupo** (`origin_groups`) é
  lista que o Luiz cria (inline pelo "+ Novo grupo..." do select); **Vendedor** = `sellers`. Migrations
  (todas APLICADAS, mesmo dia): `origem_rules_add_afiliado` (`20260629160459`),
  `origem_rules_multi_condition` (`20260629161019`, troca o par (field,value) por 4 colunas
  `*_value`), `origem_rules_match_type` (`20260629163109`, colunas `*_match` ILIKE),
  `origem_rules_is_empty_match` (`20260629163852`).
  - **FUSÃO em `/origens` (2026-06-29):** as 3 telas do fluxo de origem foram unidas numa página
    única **`/origens`** com ABAS via **rotas-filhas reais** do react-router: **`/origens/classificar`**
    (era `/classificar` → `src/pages/origens/AbaClassificar.tsx`), **`/origens/regras`** (era `/regras`
    → `AbaRegras.tsx`) e **`/origens/vendedores`** (era `/vendedores` → `AbaVendedores.tsx`). Shell
    `src/pages/origens/OrigensLayout.tsx` (1 `PageHeader` "Origens" + faixa de abas `NavLink` + `Outlet`;
    subtítulo por-segmento derivado puro via `useLocation`, sem state). As 3 telas viraram componentes-aba
    **movidos quase intactos** (cortado só o `PageHeader`; imports `../`→`../../`) — **zero lógica de
    RPC/motor tocada**. **Um único item de menu "Origens"** (ícone `Filter`) em Receitas & Vendas (5→3
    itens; ícones `Handshake`/`ListChecks` saíram). As rotas antigas `/classificar`/`/regras`/`/vendedores`
    são `<Navigate replace>` pra `/origens/*` (bookmarks seguem; `routePrefetch` re-mapeado, antigas
    apontam pro mesmo chunk). **Cross-links:** no relatório da `AbaVendedores` cada nome linka pra
    `/origens/regras?vendedor=<id>` (mapeia nome→id pela lista `sellers`; a RPC não traz `seller_id`), e a
    `AbaRegras` lê o `?vendedor` (lazy-init do `expandido`, sem effect) abrindo a aba do grupo dele + o
    acordeão; cada card de vendedor tem "ver relatório" → `/origens/vendedores`. **Isolamento de estado de
    graça:** a aba inativa desmonta → `carregar()` roda de novo ao revisitar (invalidação cross-aba
    automática, sem cache/Context). As descrições abaixo das telas `/regras` e `/classificar` valem
    integralmente pras abas homônimas; o `RegraModal` segue compartilhado e intocado (também usado em
    `/hotmart`). Design escolhido por painel multi-agente (URL-first + cross-links), build limpo, smoke OK.
  - **Tela `/regras`** (agora aba `/origens/regras`, ícone do grupo `Filter`): regras em
    **ABAS por grupo** (uma aba por `origin_groups` + "Sem grupo" se houver regra com `group_id` null;
    aba efetiva derivada, sem effect). A aba de um grupo que **tem vendedores** (Comercial) sub-agrupa
    **por vendedor** — card/acordeão por seller ativo (todos aparecem, mesmo sem regra, pra adicionar),
    com "+ adicionar condição" já preenchendo grupo+vendedor; regras sem vendedor nesse grupo caem num
    card "Sem vendedor". As demais abas (Tráfego Pago, Orgânico, ...) **listam as condições direto**, sem
    vendedor (chips + Editar/Excluir + "+ adicionar condição"). Heurística da aba: mostra por-vendedor
    se alguma regra do grupo tem `seller_id`. Botão **"+ Novo grupo"** (cria aba) e **"Aplicar agora"**
    (`apply_origin_rules`). Criar grupo pelo modal (renderizado DEPOIS do modal de regra pra ficar por
    cima — ambos `z-50`). Sellers carregados só com `active=true`.
  - **Tela `/classificar`** ("Classificar origens", grupo Receitas & Vendas, ícone `ListChecks`) —
    fluxo de mapeamento ORIENTADO A VALORES, não a linhas (insight da auditoria 2026-06-29: a tarefa é
    classificar ~167 src distintos por volume, não percorrer ~14k vendas). Consome a RPC read-only
    **`origin_unmapped_values(p_field, p_company, p_currency)`** (`20260629213111`, GROUP BY
    src|sck|afiliado entre as a_classificar do universo aprovado+BRL — mesmo dos KPIs — devolve valor
    distinto + contagem por volume, SEM baixar linhas). Abas src/sck/afiliado, lista por volume com
    barra de proporção; "Criar regra" abre o RegraModal compartilhado pré-preenchido com o valor; salvar
    → reapply → o valor cai da lista. Cauda longa (valores de 1 venda = ruído visitor-id) sinalizada.
    Substitui o mapeamento por-linha que vivia na `/hotmart` (esta voltando a ser financeira leve).
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
  - **CANAL REMOVIDO de vez** (UI em 2026-06-29, banco em 2026-06-30 pela auditoria, migration
    `origem_remove_cluster_canal` `20260630160952`): a tabela `origin_channels`, a coluna `channel_id`
    (em `hotmart_sale_class` e `origin_tracking_rules`), a RPC `hotmart_by_channel` e os utils mortos
    `hotmart_canal_base`/`hotmart_origin_suggest` foram **dropados** (tudo era nulo/órfão). A view
    `hotmart_sales_origin` e `reapply_all`/`apply_origin_rules_one`/`hotmart_by_group`/
    `hotmart_seller_report`/`origin_unmapped_values` foram **recriadas sem canal** (origem = só o grupo).
    Modelo final: **Grupo + Vendedor**, sem canal.
  - **Auto-classificação de venda nova (auditoria 2026-06-30, migration `origem_auto_classifica_venda_nova`
    `20260630144220`):** trigger `trg_hotmart_classify_new` (AFTER INSERT em `hotmart_sales`) chama
    `apply_origin_rules_one(tx)` — classificação incremental de 1 venda com a MESMA precedência da
    `reapply_all` (mais específica vence, empate por `created_at`, nunca clobbera `manual`). Antes não
    havia trigger → venda nova ficava `a_classificar` até alguém mexer numa regra (relatórios
    sub-contavam silenciosamente). Trigger defensivo (erro de classificação não bloqueia a gravação da
    venda); casa por `src`/`sck`/`xcod` já gravados (regra só-de-afiliado ainda depende do reapply).
    `apply_origin_rules_one` e `trg_classify_new_sale` são INTERNAS (EXECUTE revogado de todos —
    migration `seguranca_lockdown_funcoes_origem` `20260630161801`; o trigger roda como owner).
  - **Histórico (tudo 2026-06-29):** v1 (`hotmart_origin_map`+`hotmart_sck_map`+`hotmart_affiliate_map`)
    → v2 (canais 2 níveis + de-para `origin_tracking_map` + `origin_sale_override`) → **v3**
    (classificação manual POR VENDA com 3 selects inline em `/origem`, migration
    `origem_classificacao_por_venda` `20260629150351`) → **v4** (regras de propagação, atual). Removidos
    ao longo do caminho: as 3 tabelas v1, `origin_tracking_map`, `origin_sale_override`,
    `origin_channels.grupo`(enum)/`seller_id`, a tela `/origem`, e várias RPCs antigas
    (`hotmart_channels`/`scks`/`affiliates`/`by_origin`/`by_seller`/`by_person`/`origin_channels_list`/
    `origin_tracking_unmapped`). Os utils `hotmart_canal_base`/`hotmart_origin_suggest` (antes mantidos
    sem uso) e todo o cluster CANAL foram **dropados na auditoria 2026-06-30** (ver acima).
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
  **Feedback global (auditoria de design 2026-06-30):** `src/components/Toast.tsx`
  (`ToastProvider` no App + hook `useToast()(msg, tom?)`, aviso efêmero auto-some 3.5s)
  pra sucesso de ações que retornavam em silêncio; `src/components/Confirm.tsx`
  (`ConfirmProvider` + `useConfirm()` promise-based — `if (!(await confirmar({mensagem,
  perigo:true}))) return`) **substituiu todos os `window.confirm`** por Modal do DS.
  **Padrão de loading:** todas as telas têm `carregando`/skeleton (mata o flash de "R$ 0"
  antes dos dados). Sidebar (`Layout.tsx`) clara, 7 grupos por domínio (rótulos pós-auditoria:
  Compras pendentes · Conciliação Bancária · DRE × Caixa · Mapear produtos · **Origens** —
  ver fusão acima). **Gotcha Tailwind 4:** um
  `*/` dentro de comentário no `index.css` fecha o comentário cedo e derruba o
  `@theme` inteiro (silencioso, sem erro óbvio) — nunca escrever `bg-*/text-*`
  em comentário.
- Env: `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (chaves novas
  `sb_publishable_`/`sb_secret_`; as JWT legadas estão **desabilitadas** — não
  reativar). `.env.example` na raiz.
- `npm run dev` → localhost:5173 · `npm run build` (tsc strict + vite) ·
  `npm run lint` · **`npm run test:run`** (vitest, single-pass) / `npm run test` (watch).
  **Testes (auditoria 2026-06-30, antes ZERO):** vitest `environment:'node'` (config no
  `vite.config.ts`), specs da matemática de dinheiro PURA em `src/lib/*.test.ts` — `fatura`
  (valorComSinal + parseOFXCartao), `format` (datas + fake timers), `hotmart` (parseValor BR/US
  + parseData + vendaAprovada), `ofxExtrato` (sinal preservado). 34 testes. Regra: **não importar
  `./supabase` em código testado** (mantém os parsers puros). As RPCs de dinheiro (DRE/origem) só
  testáveis com Postgres — pendente (stack local ou pgTAP).
  `npm run lint` (0 errors; os 29 warnings conscientes = 28 set-state-in-effect
  (fetch-on-mount das páginas + o debounce de alcance do RegraModal) + 1
  react-compiler "incompatible library" das libs de tabela na DataTable — ver
  eslint.config.js). Cada página nova com o
  padrão `useEffect(() => { carregar() }, [carregar])` soma 1 fetch-on-mount (a
  tela Transferências somou +1 em 2026-06-25; a remoção de categoria havia
  derrubado 3 no mesmo dia; a tela Log de Deleções somou +1 em 2026-06-30).
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
  Pra muitas linhas sem travar há 2 opções opt-in (mut. exclusivas): **paginação**
  (`pageSize`, TanStack `getPaginationRowModel` + controles Anterior/Próxima) e
  **virtualização** (`virtualize`, `@tanstack/react-virtual` v3.13.12 pinado): rola
  TODAS as linhas num container de altura fixa (`maxHeight`, default 70vh) com header
  sticky, mas só renderiza as ~30 visíveis no DOM (padding-rows + `measureElement`
  pra altura variável). O `/hotmart` usa **`virtualize`** (mostra as 1000 num scroll
  contínuo sem travar). **Ordenação** opt-in por coluna via `DataColumn.sortFn`
  (clicar no header alterna asc/desc; ícone seta) — convive com o arrastar (clique
  ordena, arraste reordena). **Filtro de presença** opt-in via `DataColumn.filterPresenca`
  (funil no header, aparece no hover/ativo: cicla Todos → Com valor → Vazio; usa o
  valor do `sortFn`) — no `/hotmart` nas colunas Vendedor/src/sck/xcode/Afiliado, pra
  "trazer só as vendas onde a coluna tem valor". **É server-side no Hotmart**: o
  DataTable só guarda o estado client-side, mas avisa o pai via
  `onPresenceFiltersChange` e o `carregarVendas` aplica o filtro NA QUERY
  (`.not(col,'is',null).neq(col,'')` / `.or(col.is.null,col.eq.)`). Senão o filtro só
  veria as 1000 já carregadas — ex.: "A classificar + Afiliado com valor" tem 65
  vendas, mas só 1 estava entre as 1000 recentes. Reordenar normaliza a `columnOrder` salva (descarta ids
  de colunas que não existem mais — ex.: `canal`→`vendedor`).
