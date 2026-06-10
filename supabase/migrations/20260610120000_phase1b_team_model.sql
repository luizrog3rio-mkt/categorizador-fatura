-- ============================================================================
-- Fase 1b — Modelo de equipe (team access)
-- ============================================================================
-- ATENÇÃO (convenção do projeto): o version deste arquivo é placeholder.
-- O `apply_migration` gera o version no momento do apply; renomear o arquivo
-- depois pra casar com o registrado (mesmo rito da Fase 1a).
--
-- O que faz (numa única transação; qualquer guarda falhando aborta tudo):
--   1. Consolida os seeds duplicados: deleta as 9 categories e os 62
--      auto_rules do usuário Luiz (20eb0773), verificados em 2026-06-10 como
--      cópias exatas dos da Lívia (7540c0b9). Nada referencia essas linhas:
--      não existe FK apontando pra categories/auto_rules (transactions.category
--      é texto) e TODOS os dados — 3 invoices, 519 transactions, 9
--      purchase_items, 8 purchase_item_categories — pertencem à Lívia.
--   2. Troca 7 das 9 policies own-rows (`(select auth.uid()) = user_id`) pelo
--      modelo de equipe: `using (true) with check (true)` para authenticated
--      nas 6 tabelas de dados + SELECT de equipe em profiles. As 2 policies de
--      escrita de profiles (INSERT/UPDATE do dono) ficam. Estado final
--      esperado em pg_policies: 9 policies (7 novas + 2 mantidas).
--      `with check (true)` é necessário porque o app edita linhas alheias
--      preservando o user_id original (ex.: membro recategoriza transação da
--      Lívia — o UPDATE mantém user_id dela). Consequência assumida: user_id
--      deixa de ser campo de autoria CONFIÁVEL (qualquer membro pode gravar
--      user_id de outro) — não usar pra auditoria sem revalidar server-side.
--   3. user_id: ON DELETE CASCADE → RESTRICT nas 6 tabelas de dados. No
--      modelo de equipe os dados são da EMPRESA: deletar a conta da Lívia no
--      dashboard hoje apagaria as 3 faturas e as 519 transações em cascata.
--      Com RESTRICT, deletar usuário com dados falha — o admin reatribui ou
--      limpa antes, conscientemente. profiles mantém CASCADE (perfil é 1:1
--      com a conta e deve morrer junto).
--
-- O que NÃO muda:
--   - Least-privilege da Fase 1a: anon segue sem acesso algum (revogado).
--     O "mundo" continua barrado — só muda o que um usuário AUTENTICADO vê.
--   - handle_new_user: continua só criando o profile. Os seeds são do app
--     (App.jsx) e só disparam quando a tabela parece VAZIA — com os dados da
--     equipe visíveis a todos, nunca mais re-semeiam.
--
-- PRÉ-REQUISITO OPERACIONAL (fora deste SQL, conferir ANTES do apply):
--   signup público DESABILITADO no dashboard (Authentication → Sign In/Up).
--   Com using (true), qualquer conta nova enxerga todos os dados da empresa —
--   contas de equipe passam a nascer só por criação manual do admin.
-- ============================================================================

-- ── 1. Consolidação dos seeds duplicados (com guardas) ──────────────────────

do $$
declare
  v_luiz  constant uuid := '20eb0773-c975-411d-b957-fbe8c4daa562';
  v_livia constant uuid := '7540c0b9-4e5e-4d28-b123-dbe4110ac1a3';
  n integer;
begin
  -- Guarda 0: existem EXATAMENTE as 2 contas conhecidas em auth.users.
  -- Pós-1b o gate inteiro vira "ter um JWT authenticated"; uma conta-fantasma
  -- criada enquanto o signup esteve aberto ganharia acesso total e escaparia
  -- das guardas abaixo (que só olham Luiz/Lívia). Se esta guarda disparar:
  -- auditar auth.users, deletar a conta estranha E aguardar a expiração do
  -- access token dela (JWT é stateless — vale até o exp, default 1h) antes
  -- de tentar de novo. Ver runbook.
  select count(*) into n from auth.users;
  if n <> 2 then
    raise exception 'Fase 1b abortada (guarda 0): auth.users tem % conta(s), esperado 2', n;
  end if;
  select count(*) into n from auth.users where id in (v_luiz, v_livia);
  if n <> 2 then
    raise exception 'Fase 1b abortada (guarda 0): as 2 contas não são as esperadas (% match)', n;
  end if;

  -- Guarda 1: o usuário Luiz não pode ter NENHUM dado além dos seeds.
  select (select count(*) from public.invoices                 where user_id = v_luiz)
       + (select count(*) from public.transactions             where user_id = v_luiz)
       + (select count(*) from public.purchase_items           where user_id = v_luiz)
       + (select count(*) from public.purchase_item_categories where user_id = v_luiz)
    into n;
  if n <> 0 then
    raise exception 'Fase 1b abortada (guarda 1): usuário Luiz tem % linha(s) de dados além dos seeds', n;
  end if;

  -- Guarda 2: contagens exatamente como verificadas na aprovação (2026-06-10).
  select count(*) into n from public.categories where user_id = v_luiz;
  if n <> 9 then
    raise exception 'Fase 1b abortada (guarda 2): categories do Luiz = %, esperado 9', n;
  end if;
  select count(*) into n from public.categories where user_id = v_livia;
  if n <> 12 then
    raise exception 'Fase 1b abortada (guarda 2): categories da Lívia = %, esperado 12', n;
  end if;
  select count(*) into n from public.auto_rules where user_id = v_luiz;
  if n <> 62 then
    raise exception 'Fase 1b abortada (guarda 2): auto_rules do Luiz = %, esperado 62', n;
  end if;
  select count(*) into n from public.auto_rules where user_id = v_livia;
  if n <> 62 then
    raise exception 'Fase 1b abortada (guarda 2): auto_rules da Lívia = %, esperado 62', n;
  end if;

  -- Guarda 3: toda categoria do Luiz tem par exato (name, color_index) na Lívia.
  select count(*) into n
  from public.categories l
  where l.user_id = v_luiz
    and not exists (
      select 1 from public.categories v
      where v.user_id = v_livia
        and v.name = l.name
        and v.color_index = l.color_index);
  if n <> 0 then
    raise exception 'Fase 1b abortada (guarda 3): % categoria(s) do Luiz sem par exato na Lívia', n;
  end if;

  -- Guarda 4: auto_rules idênticos nos DOIS sentidos (category + keywords).
  -- Prova Luiz ⊆ Lívia em (category, keywords) distintos — suficiente pro
  -- delete ser sem perda (toda regra deletada tem gêmea sobrevivente); as
  -- contagens pinadas na guarda 2 detectam qualquer drift desde a aprovação.
  select count(*) into n from (
    select 1 from public.auto_rules a
    where a.user_id = v_luiz
      and not exists (
        select 1 from public.auto_rules b
        where b.user_id = v_livia
          and b.category = a.category
          and b.keywords = a.keywords)
    union all
    select 1 from public.auto_rules a
    where a.user_id = v_livia
      and not exists (
        select 1 from public.auto_rules b
        where b.user_id = v_luiz
          and b.category = a.category
          and b.keywords = a.keywords)
  ) diff;
  if n <> 0 then
    raise exception 'Fase 1b abortada (guarda 4): % regra(s) sem par exato entre os dois usuários', n;
  end if;

  -- Deletes, conferindo o número exato de linhas atingidas.
  delete from public.categories where user_id = v_luiz;
  get diagnostics n = row_count;
  if n <> 9 then
    raise exception 'Fase 1b abortada: delete de categories atingiu % linha(s), esperado 9', n;
  end if;

  delete from public.auto_rules where user_id = v_luiz;
  get diagnostics n = row_count;
  if n <> 62 then
    raise exception 'Fase 1b abortada: delete de auto_rules atingiu % linha(s), esperado 62', n;
  end if;
end $$;

-- ── 2. Policies do modelo de equipe ─────────────────────────────────────────
-- Nomes dos DROPs conferidos contra pg_policies em 2026-06-10.

drop policy "Users manage own categories" on public.categories;
create policy "Team manages all categories" on public.categories
  for all to authenticated using (true) with check (true);

drop policy "Users manage own rules" on public.auto_rules;
create policy "Team manages all rules" on public.auto_rules
  for all to authenticated using (true) with check (true);

drop policy "Users manage own invoices" on public.invoices;
create policy "Team manages all invoices" on public.invoices
  for all to authenticated using (true) with check (true);

drop policy "Users manage own transactions" on public.transactions;
create policy "Team manages all transactions" on public.transactions
  for all to authenticated using (true) with check (true);

drop policy "Users manage own purchase items" on public.purchase_items;
create policy "Team manages all purchase items" on public.purchase_items
  for all to authenticated using (true) with check (true);

drop policy "Users manage own purchase categories" on public.purchase_item_categories;
create policy "Team manages all purchase categories" on public.purchase_item_categories
  for all to authenticated using (true) with check (true);

-- profiles: equipe enxerga todos os perfis; escrita continua só do dono.
drop policy "Users can view own profile" on public.profiles;
create policy "Team views all profiles" on public.profiles
  for select to authenticated using (true);
-- "Users can insert own profile" e "Users can update own profile" ficam como estão.

-- ── 3. user_id: CASCADE → RESTRICT nas tabelas de dados ─────────────────────
-- Nomes das constraints conferidos contra pg_constraint em 2026-06-10.

alter table public.categories
  drop constraint categories_user_id_fkey,
  add constraint categories_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete restrict;

alter table public.auto_rules
  drop constraint auto_rules_user_id_fkey,
  add constraint auto_rules_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete restrict;

alter table public.invoices
  drop constraint invoices_user_id_fkey,
  add constraint invoices_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete restrict;

alter table public.transactions
  drop constraint transactions_user_id_fkey,
  add constraint transactions_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete restrict;

alter table public.purchase_items
  drop constraint purchase_items_user_id_fkey,
  add constraint purchase_items_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete restrict;

alter table public.purchase_item_categories
  drop constraint purchase_item_categories_user_id_fkey,
  add constraint purchase_item_categories_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete restrict;
