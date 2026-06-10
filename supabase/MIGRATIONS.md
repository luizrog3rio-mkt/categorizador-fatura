# Migrations — runbook (Fase 1a ✅ aplicada · Fase 1b ✅ aplicada)

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

## Ordem de aplicação (passos 1–5 ✅ executados em 2026-06-10, incluindo o smoke)

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
     categorias/regras default e agravaria a consolidação da Fase 1b (21→30 em vez de
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

---

# Fase 1b — modelo de equipe

> **Status: APLICADO em 2026-06-10 (SQL revisado e aprovado pelo Luiz no mesmo dia).**
> Arquivo: `migrations/20260610115934_phase1b_team_model.sql` (renomeado do placeholder
> `20260610120000` pro version real registrado pelo apply). Todas as 5 guardas passaram.
> Verificação pós-apply: counts 12/62/8 e dados da Lívia intactos (3/519/9); 9 policies
> (7 team + 2 own de profiles); 6 FKs user_id em RESTRICT, profiles em CASCADE; anon
> segue 401/42501. Advisors security: **6 WARN `rls_policy_always_true` (lint 0024)
> nas 6 policies de equipe — é exatamente o design da 1b, aceitos por decisão** (a
> previsão "security zerado" do rascunho estava errada; o lint 0024 flagra using(true)
> em ALL). Pré-requisitos confirmados por probe na janela do apply: `signup_disabled`,
> `anonymous_provider_disabled`, auth.users = só as 2 contas, backup diário de
> 2026-06-10 07:58 UTC presente.

## O que muda

1. **Consolidação dos seeds duplicados** — deleta as 9 `categories` e os 62
   `auto_rules` do usuário Luiz (`20eb0773`), verificados como cópias exatas dos
   da Lívia (`7540c0b9`) em 2026-06-10 (par por name+color_index nas categorias;
   category+keywords idênticos nos dois sentidos nas regras). Resultado:
   categories 21→12, auto_rules 124→62, purchase_item_categories já era 8 (só
   da Lívia). O DO block tem 5 guardas + conferência de row_count nos deletes:
   a guarda 0 exige `auth.users` com EXATAMENTE as 2 contas conhecidas (mata o
   vetor de conta-fantasma criada com o signup aberto), e as demais pinam as
   contagens/conteúdos verificados na aprovação. Qualquer divergência aborta a
   transação inteira sem efeito.
2. **Policies de equipe** — as 6 tabelas de dados saem de
   `(select auth.uid()) = user_id` para `for all to authenticated using (true)
   with check (true)`. O `with check (true)` é obrigatório: o app edita linhas
   alheias preservando o `user_id` original (recategorizar transação da Lívia
   mantém o user_id dela — um own-check quebraria toda edição de equipe).
   `profiles`: equipe lê todos os perfis; INSERT/UPDATE continuam do dono.
3. **FKs de user_id: CASCADE → RESTRICT** — no modelo de equipe os dados são da
   empresa. Antes, deletar a conta da Lívia no dashboard apagaria as 3 faturas e
   as 519 transações em cascata. Com RESTRICT, deletar usuário com dados falha
   explicitamente. `profiles` mantém CASCADE (1:1 com a conta).

Acompanham 3 fixes de app no `App.jsx` (todos no-op ou inofensivos sob as
policies atuais — deployar ANTES do apply, ver ordem abaixo):

- remover o `.eq("user_id", user.id)` do load de itens pendentes (modal
  pós-import de OFX) — era o único filtro explícito por dono; sem remover,
  esse modal mostraria só os itens do usuário logado enquanto o resto do app
  mostra os da equipe;
- **seed-on-error**: os 3 blocos de seed (`categories`, `auto_rules`,
  `purchase_item_categories`) semeavam quando `data` vinha null — ou seja,
  também em ERRO de rede/token, não só em tabela vazia. Sob o modelo de equipe
  isso re-poluiria os dados consolidados na primeira falha transiente. Agora
  só semeia quando o select respondeu com array vazio (`else if (dbCats)`);
- **confirmação no deleteInvoice**: sob `using (true)` qualquer membro apaga a
  fatura da Lívia (519 transações em cascade) com 1 clique — agora tem
  `window.confirm` antes.

Pós-1b, `user_id` deixa de ser campo de autoria confiável (o `with check
(true)` permite gravar user_id alheio — aceito por design; não usar pra
auditoria sem revalidar server-side).

## Pré-requisitos DUROS antes do apply

Pós-1b o gate inteiro vira "ter um JWT authenticated" — então TODAS as portas
de emissão precisam estar fechadas, não só o signup por e-mail:

- [x] **Fechar o signup público** (dashboard → Authentication → Sign In / Providers
      → desativar "Allow new users to sign up"). Com `using (true)` e signup
      aberto (e-mail já auto-confirma), qualquer pessoa criaria conta e veria
      todos os dados da empresa. Contas de equipe passam a nascer no dashboard
      (Authentication → Users → Add user → e-mail auto-confirmado).
- [x] **"Allow anonymous sign-ins" = OFF** (toggle SEPARADO do signup — JWT
      anônimo também é role `authenticated` e passaria nas policies).
- [x] **Nenhum provider além de Email** habilitado (OAuth/phone emitiriam JWT
      por fora do toggle de signup).
- [x] **Auditar `auth.users`**: `select id, email, created_at from auth.users`
      deve devolver SÓ as 2 contas conhecidas. Se houver conta estranha:
      deletar E **aguardar a expiração do access token dela** (JWT é stateless
      — vale até o `exp` mesmo com a conta deletada; ver JWT expiry em
      Settings → Auth, default 3600s) antes do apply. A guarda 0 da migration
      re-checa isso em SQL na hora do apply.

Probes de verificação (nunca criam usuário), re-rodar IMEDIATAMENTE antes do
apply — probe velho não vale:
`POST /auth/v1/signup` com senha de 1 caractere → fechado responde
`signup_disabled`; aberto responde `weak_password`. Anonymous:
`POST /auth/v1/signup` com body `{}` → deve dar erro. **Probes finais na
janela do apply (2026-06-10): `signup_disabled` ✓ e
`anonymous_provider_disabled` ✓.**

## Ordem de aplicação

0. **Conferir backup** (dashboard → Database → Backups): existe backup diário
   recente (org Pro)? Anotar o timestamp. É a única restauração de DADOS — e
   restore é do projeto INTEIRO (perde o dia corrente), não de tabela isolada.
   A 1b é exatamente o momento em que isso deixa de ser nice-to-have: qualquer
   membro passa a poder deletar tudo.
1. **Commit local** da migration + App.jsx + runbook ANTES do apply (sem push
   ainda — o artefato aprovado não pode viver só no working tree durante a
   operação; o deploy Vercel só dispara no push).
2. **Push → deploy do fix do App.jsx** (no-op sob as policies atuais; assim o
   smoke do passo 6 já exercita o app novo contra as policies novas).
3. Re-rodar os probes dos pré-requisitos (acima) na mesma janela do apply.
4. `apply_migration` com name `phase1b_team_model` e o conteúdo do arquivo.
5. `list_migrations` → anotar o version real, renomear o arquivo local E
   atualizar as referências cruzadas (linha "Arquivo:" desta seção, header do
   SQL, status do runbook → aplicada).
6. Re-rodar advisors (security mostra **6 WARN `rls_policy_always_true`/lint
   0024 nas policies de equipe — é o design da 1b, aceitos**; performance pode
   reclamar `unused_index` — INFO inofensivo) e o smoke test do modelo de equipe
   (usuário descartável criado pelo admin no dashboard): login → vê as 3
   faturas e 519 transações da Lívia → **importa um OFX descartável e confere
   que o modal de pendentes lista os itens da Lívia** (exercita o fix do
   filtro) → exclui a fatura importada (cascade limpa) → cria e deleta um item
   de compra → logout → deletar o usuário descartável no dashboard (com
   RESTRICT, só depois de limpar o que ele criou — o smoke já limpa; o profile
   dele morre via CASCADE, que ficou intacto). Probes REST: anon segue
   401/42501; authenticated de outro usuário agora lê os dados da equipe.
7. Commit final (rename + referências) + push.

## Rollback (se precisar voltar atrás)

Policies RLS são permissivas (OR): recriar as own-rows SEM dropar as de equipe
manteria acesso total. Reverter = **primeiro dropar as 7 policies de equipe**:

```sql
drop policy "Team manages all categories" on public.categories;
drop policy "Team manages all rules" on public.auto_rules;
drop policy "Team manages all invoices" on public.invoices;
drop policy "Team manages all transactions" on public.transactions;
drop policy "Team manages all purchase items" on public.purchase_items;
drop policy "Team manages all purchase categories" on public.purchase_item_categories;
drop policy "Team views all profiles" on public.profiles;
```

…e então recriar as 9 policies own-rows da Fase 1a (estão por extenso, com
`drop policy if exists` + `create policy`, no arquivo
`20260610010051_phase1a_hardening.sql`) e, se desejado, voltar as FKs pra
CASCADE (espelho da seção 3 da migration trocando `restrict` por `cascade`).
Não há restauração dos seeds deletados nem precisa: eram cópias exatas, e o
próprio app re-semeia os defaults do Luiz (9+62, mais 5 purchase categories
que ele nunca teve) no primeiro login dele sob own-rows — a tabela parecerá
vazia pra ele. Os fixes do App.jsx são no-op nos dois modelos — não precisam
reverter. PERDA DE DADOS (vs. policies) só se recupera por restore
full-project do backup.

## Follow-ups pós-1b (não bloqueiam o apply)

- **Service key exposta**: as garantias de confidencialidade da 1b são VOID
  enquanto a chave viver (service_role ignora RLS). Migrar pras keys
  `sb_publishable_`/`sb_secret_` é prioridade ≥ 1b — tratar logo após.
- **`unique(name)` team-wide** em categories/purchase_item_categories (hoje é
  `unique(user_id, name)` — dois membros podem criar o mesmo nome). ⚠️ Se
  adotar, atualizar o Rollback acima: o re-seed do Luiz colidiria (23505
  engolido pelo app) — dropar a unique nova antes de restaurar own-rows.
- **Ocultar a aba "Criar conta"** no Auth.jsx — com signup fechado vira UI
  morta que devolve erro cru do GoTrue.
- **Updates otimistas sem leitura de `error`** (setCategory,
  updatePurchaseItem, attachSelectedPending): com 2+ membros simultâneos a UI
  pode "mentir" até o próximo reload. Sem corrupção — melhoria de UX.
