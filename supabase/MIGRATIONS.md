# Migrations — runbook da Fase 1a

> **Status: APLICADO em 2026-06-10 (SQL revisado e aprovado pelo Luiz em 2026-06-09).**
> Histórico vivo: `20260609120000 baseline` (registrado sem execução) → `20260610010051 phase1a_hardening`
> (executado via MCP `apply_migration`). Advisors pós-apply: **os 13 achados SQL-fixáveis zeraram**
> (0011, 0028, 0029, 0001, 0003×9); performance só um INFO `unused_index` no índice recém-criado
> (esperado — acabou de nascer, some com o uso). Smoke test ✅ PASSOU em 2026-06-10. HIBP ✅
> habilitado em 2026-06-10 (projeto transferido pra org Pro) — **advisors security: zero achados**.
> Pendência restante: migrar a service key exposta (passo manual 2).
>
> Regra do projeto (segue valendo): nenhuma migration encosta no banco sem o Luiz revisar o SQL e aprovar.

## Contexto

O banco vivo (`qdnqghefwjpeiidjlzjy`) nunca teve histórico de migrations — todo o schema
foi aplicado via SQL Editor (confirmado: `supabase_migrations.schema_migrations` não
existe; `list_migrations` vazio). Os arquivos antigos do repo (`supabase/legacy/*.sql`)
estavam desatualizados em relação à produção. A Fase 1a estabelece o marco zero:

| Arquivo | Papel | Como entra no banco |
|---|---|---|
| `migrations/20260609120000_baseline.sql` | Snapshot fiel do schema vivo (2026-06-09) | **Só registrado** no histórico — NUNCA executado (objetos já existem) |
| `migrations/20260610010051_phase1a_hardening.sql` | Correções dos advisors + menor privilégio | **Executado** via MCP `apply_migration` em 2026-06-10 |
| `audit/live-catalog-20260609.json` | Dump bruto do catálogo (proveniência do baseline) | Não entra — é documentação |

Verificação: ambos os SQLs passaram por revisão adversarial de 6 agentes (fidelidade ao
catálogo vivo, semântica de policies/grants, função/trigger vs signup, docs oficiais,
compatibilidade com o App.jsx, e este runbook) — 0 blockers em 2026-06-09.

## Ordem de aplicação (passos 1–4 ✅ executados em 2026-06-10; resta o passo 5)

1. **Aplicar o hardening** via MCP `apply_migration` com name `phase1a_hardening` e o
   conteúdo de `20260609120100_phase1a_hardening.sql`. Isso cria a tabela
   `supabase_migrations.schema_migrations` e registra a migration. Em seguida, rodar
   `list_migrations` para confirmar a criação e **anotar o version real gravado**.
2. **Renomear o arquivo local** para casar com o version real — o `apply_migration`
   gera o version com o timestamp do momento do apply, então a divergência com
   `20260609120100` é **certa**, não condicional. Atualizar também as referências
   cruzadas (tabela acima e header do baseline, se necessário).
3. **Registrar o baseline retroativamente** (sem executar) — via MCP `execute_sql` ou
   SQL Editor. **NUNCA via `apply_migration`**, que criaria um terceiro registro órfão
   no histórico:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name, statements)
   values (
     '20260609120000',
     'baseline',
     array['-- baseline registrado sem execução; schema já existia em produção. Ver supabase/migrations/20260609120000_baseline.sql']
   );
   ```
   O layout `(version, name, statements text[])` é o formato canônico do CLI
   (confirmado em `supabase/cli` `pkg/migration/history.go`); ainda assim, vale um
   `select * from supabase_migrations.schema_migrations` antes do insert.
   Alternativa canônica com CLI linkado: `supabase migration repair --status applied 20260609120000`.
   O version `20260609120000` ordena antes de qualquer timestamp futuro → histórico
   coerente: baseline → hardening.
4. **Re-rodar os advisors** (`get_advisors` security + performance): os **13 achados
   SQL-fixáveis devem zerar** (0011, 0028, 0029, 0001 e os 9× 0003). Deve restar
   **apenas** `auth_leaked_password_protection`, que só some com o passo manual de HIBP.
5. **Smoke test** (logado como a Lívia, em produção):
   - dashboard carrega (categorias, regras, faturas);
   - abrir uma fatura e editar a categoria de uma transação;
   - criar/editar/excluir um item de compra;
   - **importar um OFX de teste** (exercita os INSERTs de invoices + transactions sob
     as policies novas) e excluir a fatura criada (cascade limpa as transactions);
   - na tela deslogada, conferir o console — requests anon agora retornam 401/42501
     em vez de lista vazia (esperado; ver notas abaixo);
   - **signup de um usuário descartável** valida o trigger corrigido — e **deletar o
     usuário no dashboard (Auth → Users) depois**: o primeiro login dele semeia
     categorias/regras default e agravaria a consolidação da Fase 1b (21→33 em vez de
     21→12). Todas as FKs `user_id` têm `on delete cascade`, então o delete limpa tudo.

## Notas de comportamento pós-hardening

- **anon passa a receber 401/42501** nas 7 tabelas (antes: 200 + lista vazia, filtrada
  pela RLS). Nenhuma chamada do app roda como anon (verificado no App.jsx — tudo
  gated por `if (!user)`), mas curl/healthcheck/teste com a anon key pura muda de
  resposta. Lembrar disso em debugging futuro.
- **O app engole erros do Supabase** (destructura só `{ data }`, nunca lê `error`) —
  uma regressão apareceria como "lista vazia" silenciosa, não como mensagem de erro.
  Por isso o smoke test manual do passo 5 é obrigatório, não opcional.
- **Não usar `supabase migration fetch`** neste projeto — ele reconstruiria os arquivos
  a partir do histórico, e o `statements` do baseline lá é só um marcador. Os arquivos
  do repo são a fonte da verdade.
- **Funções RPC futuras** precisarão de `GRANT EXECUTE ... TO authenticated` explícito
  (os default privileges de functions foram revogados de PUBLIC/anon/authenticated,
  conforme o quick-reference oficial do lint 0029).

## Passos manuais no dashboard (sem SQL equivalente)

- [x] **Habilitar proteção contra senhas vazadas (HIBP)** — advisor
      `auth_leaked_password_protection`. ✅ **FEITO em 2026-06-10**: Luiz transferiu o
      projeto pra uma organização Pro (pré-requisito: Pro Plan ou superior,
      [doc oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection))
      e ativou o toggle no dashboard ([Authentication → Providers → Email](https://supabase.com/dashboard/project/qdnqghefwjpeiidjlzjy/auth/providers)).
      Verificado via `get_advisors`: security zerou. ⚠️ Nota da transferência de org: ref,
      URL, JWT secret e chaves não mudam (app/Vercel intactos), mas o **OAuth do MCP
      supabase precisou ser reautenticado** (`/mcp`) — o grant era da org antiga.
- [ ] **Rotacionar a service key** — foi exposta em chat na sessão do rb7-financeiro.
      ⚠️ **Cuidado**: o projeto usa chaves JWT **legadas** — service_role e anon são
      assinadas pelo **mesmo JWT secret**. Rotacionar o JWT secret invalida a anon key
      embutida no build da Vercel e **derruba o app** até atualizar
      `VITE_SUPABASE_PUBLISHABLE_KEY` (Vercel + `.env` local) e redeployar.
      **Caminho preferido**: migrar para as API keys novas (`sb_publishable_*` /
      `sb_secret_*`) no dashboard (Settings → API), que permite revogar a secret sem
      invalidar a publishable. Se rotacionar o secret mesmo assim, fazer env update +
      redeploy na mesma janela.

## O que o hardening NÃO faz (de propósito)

- **Não muda a semântica de acesso**: continua "cada usuário vê só o que é seu".
  O modelo de equipe (`using (true)` para authenticated) é a **Fase 1b**, que depende
  da consolidação dos seeds duplicados (categories 21→12, auto_rules 124→62).
- **Não mexe em dados** (qualidade de dados é Fase 3).
- **Não cria tabelas novas** (companies/accounts/entries é Fase 1c).
