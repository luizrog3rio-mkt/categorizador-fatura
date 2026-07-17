# RB7 Financeiro

App financeiro interno da RB7 para acompanhar cartão, contas, caixa, vendas,
DRE e custos de obras em um só lugar. Está em produção em
[categorizador-fatura.vercel.app](https://categorizador-fatura.vercel.app/).

> O repositório ainda se chama `categorizador-fatura`: o produto nasceu como
> um importador de faturas `.OFX` e foi unificado com o financeiro da empresa
> em 2026-06-10.

## Funcionalidades

- **Dashboard** — visão consolidada ou por empresa de resultado, vencimentos,
  Hotmart e faturas de cartão.
- **Cartão e compras** — importação de faturas `.OFX`, classificação por Plano
  de Contas, compras pendentes vinculáveis e exportação CSV/XLSX.
- **Contas e caixa** — contas a pagar/receber, transferências, extratos `.OFX`
  e conciliação bancária entre movimentações e lançamentos.
- **Hotmart** — sincronização por API, webhook em tempo real e cron diário,
  além de importação CSV, taxas/comissões/líquido e mapeamento de produtos.
- **Origens de venda** — classificação por grupos e vendedores, com regras de
  propagação baseadas em `src`, `sck`, `xcode` e afiliado.
- **DRE e relatórios** — DRE por competência e por produto, incluindo Hotmart,
  cartão e lançamentos; comparação DRE × Caixa e classificação em massa das
  despesas ainda sem conta.
- **Obras** — custo acumulado por obra e revisão dos lançamentos sugeridos para
  vínculo.
- **Governança** — empresas, contas e cartões, Plano de Contas, Produtos DRE,
  usuários, períodos fechados e log forense de deleções. Perfis de equipe leem;
  somente administradores alteram dados financeiros.

Não há categorias financeiras nem auto-categorização por categoria: a
classificação usa exclusivamente **Plano de Contas** e **Produto DRE**.

## Stack

React 19 · TypeScript (strict) · Tailwind CSS 4 · React Router 7 · Vite
(rolldown) · Supabase (Postgres, Auth, Edge Functions, Realtime e pg_cron) ·
Recharts · SheetJS.

## Rodando local

```bash
cp .env.example .env
npm install
npm run dev
```

Preencha `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env`. O servidor local abre em
`http://localhost:5173`; o login usa uma conta de equipe criada pelo admin.

> ⚠️ **Produção e dados reais:** não existe staging. O app local e os previews
> da Vercel usam o mesmo projeto Supabase de produção. Evite qualquer operação
> destrutiva e trate toda informação como dado financeiro real.

## Verificações

```bash
npm run test:run
npm run test:coverage
npm run lint
npm run build
```

## Deploy

O frontend é publicado pela Vercel no push para `main`, com o rewrite de SPA
definido em `vercel.json`. Edge Functions e mudanças de banco seguem fluxo
separado; um preview do frontend não cria um banco isolado.

## Banco e migrations

A fonte da verdade é o banco vivo junto de `supabase/migrations/`. O histórico,
o estado das migrations e o runbook ficam em `supabase/MIGRATIONS.md`.

**Nenhuma migration ou mutação em nuvem deve ser executada sem o Luiz revisar o
SQL e aprovar explicitamente.** O rito é:

1. criar o arquivo com versão placeholder;
2. após a aprovação, aplicar com `apply_migration` via MCP;
3. consultar `list_migrations` para obter a versão real;
4. renomear o arquivo e marcar `APLICADA` no cabeçalho.

As decisões de arquitetura e invariantes do domínio estão em `AGENTS.md` e
`CLAUDE.md`.
