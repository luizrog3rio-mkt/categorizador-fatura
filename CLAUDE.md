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
  sempre positivo (despesa de cartão).
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
  `HOTMART_CLIENT_ID`/`HOTMART_CLIENT_SECRET` no env da function. Tem modo
  `{debug:true}` que devolve a 1ª venda crua+mapeada sem gravar.
- **Cron `hotmart-sync-diario`** (pg_cron, 09:00 UTC / 06:00 BRT, janela de 1
  mês): chama a function via `net.http_post` lendo o segredo do **Vault**
  (`hotmart_service_key`).
- Mapeamento validado contra dados reais: bruto=`purchase.price.value`,
  taxa=`purchase.hotmart_fee.total`; afiliado/coprodução vem do array
  `commissions` (ainda NÃO validado com venda de afiliado real).
- Upsert MERGE por `transaction_code` (reimport/sync atualiza status —
  reembolso/chargeback refletem).

## Convenções

- Env: `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (chaves novas
  `sb_publishable_`/`sb_secret_`; as JWT legadas estão **desabilitadas** — não
  reativar). `.env.example` na raiz.
- `npm run dev` → localhost:5173 · `npm run build` (tsc strict + vite) ·
  `npm run lint` (0 errors; os 12 warnings de fetch-on-mount são conscientes,
  ver eslint.config.js).
- `xlsx` vem do tarball oficial do SheetJS (cdn.sheetjs.com) — o pacote do npm
  está abandonado com CVE; não trocar de volta.
- PowerShell 5.1: mensagem de `git commit` via here-string `@'...'@` **não
  pode conter aspas duplas** (re-tokenização quebra o comando nativo).
- O "mundo fatura" (src/components/fatura/, Faturas, Fatura) usa estilos
  inline portados 1:1 do app antigo — fidelidade visual aos 15 contratos de
  `docs/fase2/contratos-app-antigo.md`. É intencional; o resto é Tailwind.
