# RB7 Financeiro

App financeiro interno da RB7 Digital — controle de faturas de cartão, contas
a pagar/receber, extratos bancários e conciliação Hotmart, num app só.

> Repo: `categorizador-fatura` (nome histórico — o app nasceu como um
> categorizador de faturas .OFX e foi unificado com o financeiro da empresa
> em 2026-06-10).

## Features

- **Faturas de Cartão** — importa `.OFX` do cartão, auto-categoriza por
  regras (62 regras de keywords), filtros/busca, dashboard por fatura com
  drill-down, export CSV/XLSX (formato pt-BR).
- **Compras** — anotações de compras pendentes agrupadas por mês; ao importar
  uma fatura, o app oferece atrelá-las.
- **Contas a Pagar/Receber** — lançamentos com emissão → vencimento →
  pagamento, status automático, totais.
- **Extratos (OFX)** — conciliação de conta corrente com dedupe por FITID
  (com id sintético pra transações sem FITID) e relatório de duplicatas.
- **Hotmart** — sincronização direta pela API (botão manual + cron diário
  às 06:00 BRT) com bruto/taxas/comissões/líquido; CSV como fallback.
- **Dashboard** — visão híbrida: gasto de cartão (categorias e faturas) +
  fluxo financeiro (a pagar/receber, Hotmart).
- **Contas & Cartões** e **Categorias** (gestão com renomear-em-cascata).

## Stack

React 19 · TypeScript (strict) · Tailwind CSS 4 · react-router 7 · Vite
(rolldown) · Supabase (Postgres + Auth + Edge Functions + pg_cron) · recharts
· SheetJS.

## Rodando local

```bash
cp .env.example .env   # preencha a VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev            # localhost:5173
```

⚠️ **Não há staging**: o app local aponta pro banco de produção (dados reais).
Login com conta de equipe (criadas pelo admin no painel do Supabase — signup
público desabilitado).

## Deploy

Vercel, automático no push pra `main`. SPA rewrites em `vercel.json`.

## Banco e migrations

Schema versionado em `supabase/migrations/` (baseline + migrations aplicadas);
runbook e decisões em `supabase/MIGRATIONS.md`. Regra do projeto: **nenhuma
migration é aplicada sem revisão e aprovação do dono.** Convenções de
arquitetura e invariantes: `CLAUDE.md`.
