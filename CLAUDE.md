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
Faturas de Cartão (import OFX + auto-categorização + export CSV/XLSX),
Compras (anotações pendentes por mês), Contas a Pagar/Receber (`entries`),
Extratos OFX (`bank_transactions`), Hotmart (sync via API + cron diário),
Contas & Cartões (`accounts`), Categorias (gestão com rename-cascade).

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
- **Categoria é TEXTO por nome** em transactions/purchase_items/auto_rules
  (sem FK) — auditado na Fase 3 e mantido (dado íntegro; a tela Categorias faz
  cascade no rename). `transactions.date` é texto 'DD/MM/YYYY'; `amount` é
  sempre positivo (magnitude) e `transactions.kind` ('debit'/'credit') dá o
  sinal contábil: débito = despesa (soma), crédito = estorno/desconto (abate).
  O parser de cartão (`lib/fatura.ts`) classifica pelo TRNTYPE do OFX e
  **descarta o pagamento da fatura anterior** (CREDIT com memo `/PAGAMENTO|BOLETO/`,
  que se anula com a linha "FATURA ANTERIOR"). Total/dashboards/export usam o
  helper `valorComSinal()` — fonte única do sinal (decisão de 2026-06-22,
  desvia do contrato #3 que descartava todo crédito). Faturas importadas ANTES
  dessa data têm `kind='debit'` no backfill e total inflado pelos créditos
  ignorados — só reimportar corrige.
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
  `{debug:true}` (1ª venda crua+mapeada sem gravar) e `{refresh_status:N}`
  (só serviço: re-checa N vendas por `?transaction=<id>` p/ capturar estorno).
- **Crons** (pg_cron, lendo o segredo do **Vault** `hotmart_service_key` via
  `net.http_post`, timeout 120s): `hotmart-sync-diario` (09:00 UTC, descoberta
  de vendas novas, janela 1 mês) e `hotmart-refresh-status-diario` (09:30 UTC,
  refresh de estorno, rodízio por `status_checked_at`, ~200/dia).
- **Mapeamento de valores validado contra dados reais (2026-06-11), ver
  [[hotmart-mapeamento-campos]]**: `total_amount`=`purchase.price.value`
  (VALOR TOTAL pago, **inclui juros de parcelamento**); `gross_amount`=
  **`purchase.hotmart_fee.base`** (BRUTO, preço do produto sem juros —
  `price.base` NÃO existe); taxa=`purchase.hotmart_fee.total`; líquido=bruto−taxa
  (`/sales/history` NÃO traz `commissions[]` → afiliado/coprodução ficam 0, net
  exato só p/ `commission_as=PRODUCER`). ~37,5% das vendas são parceladas.
- **Moeda**: coluna `currency` (`price.currency_code`); a base tem vendas USD/
  EUR/PYG/etc. A RPC `hotmart_totals` filtra `currency='BRL'` (default) e
  devolve `fora_moeda` (nº excluído) — **nunca somar moedas diferentes** (5
  vendas PYG já chegaram a inflar o "Bruto" em ~R$8,7M antes do filtro).
- **`status` cru em inglês** (COMPLETE/APPROVED/REFUNDED...); a busca por janela
  de data OMITE estornos (por isso o cron de refresh por transação). A allowlist
  de receita (regex PT+EN) vive em `hotmart_totals` e em `lib/hotmart.ts`.
- Upsert MERGE por `transaction_code` (reimport/sync atualiza status —
  reembolso/chargeback refletem).

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
  `Badge cor={hex}` legado segue **só** p/ identidade de categoria/natureza
  (preservar). `btnPrimario`/`btnSecundario` viraram alias-string tokenizados.
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
  padrão `useEffect(() => { carregar() }, [carregar])` soma 1 fetch-on-mount (as
  4 telas novas da DRE levaram o total de 17→21).
- `xlsx` vem do tarball oficial do SheetJS (cdn.sheetjs.com) — o pacote do npm
  está abandonado com CVE; não trocar de volta.
- PowerShell 5.1: mensagem de `git commit` via here-string `@'...'@` **não
  pode conter aspas duplas** (re-tokenização quebra o comando nativo).
- O "mundo fatura" (src/components/fatura/, Faturas, Fatura) foi **padronizado
  no design system** (Tailwind + `ui.tsx` + `DataTable` + `Modal`; estilos inline
  e o `estilos.ts`/objeto `S` foram removidos — 2026-06-19). Os 15 contratos de
  `docs/fase2/contratos-app-antigo.md` são preservados no **comportamento/dados**
  (parser OFX, `fit_id` não-dedupe, categoria-string, fluxo de pendentes, export
  filtrados-vs-todos, drill-down, texto exato do confirm de excluir fatura,
  reimport duplica); a **fidelidade visual 1:1 deixou de ser regra** — o visual
  agora segue o resto do app.
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
  `columnVisibility` do `useColumnPrefs`).
