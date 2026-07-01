-- APLICADA: 20260701021714
-- Auditoria multi-empresa/papeis #5: torna o papel 'viewer' um LIMITE REAL de leitura no banco
-- (decisao do Luiz, 2026-06-30). Antes: RLS team-model using(true) p/ todo authenticated -> viewer
-- era so UI (um viewer escrevia via API direta); + a policy de UPDATE de profiles nao travava a
-- coluna role -> auto-promocao (viewer PATCH /profiles {role:'admin'}). Agora: writes das tabelas de
-- dados exigem is_admin(); a coluna role so muda via service_role (edge user-management, admin-gated)
-- ou postgres (migration/dashboard). Leitura continua de EQUIPE (SELECT using(true) p/ authenticated).
-- Servico (sync/webhook/cron via service key) bypassa RLS -> intocado. 4 usuarios hoje sao admin.

-- 1) quem e admin (definer p/ ler profiles sem depender de RLS; so authenticated executa)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 2) trava a coluna role: cliente (authenticated/anon) nao muda o proprio papel; so service_role
--    (edge user-management, ja admin-gated) ou postgres (migration/dashboard). O default fail-safe
--    'viewer' e o handle_new_user (INSERT) seguem intocados (este trigger e BEFORE UPDATE).
create or replace function public.guard_profile_role()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role and current_user in ('authenticated', 'anon') then
    raise exception 'Alterar o papel (role) so e permitido via admin (tela de Usuarios).';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- 3) tabelas de dados: SELECT continua p/ todo authenticated (leitura de equipe), mas
--    INSERT/UPDATE/DELETE passam a exigir is_admin(). Cada uma tem hoje 1 unica policy ALL
--    using(true) with check(true) -> troca por 4 policies. (select is_admin()) avalia 1x/query.
do $$
declare
  t text;
  p text;
  tbls text[] := array[
    'accounts','bank_transactions','chart_of_accounts','companies','dre_products','entries',
    'hotmart_product_map','hotmart_sale_class','hotmart_sales','invoices','origin_groups',
    'origin_tracking_rules','purchase_items','sellers','transactions'
  ];
begin
  foreach t in array tbls loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t and cmd = 'ALL' loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t || '_del', t);
  end loop;
end $$;

-- 3b) closed_periods ja tinha policies separadas (SELECT/INSERT/DELETE). SELECT fica (todos leem);
--     INSERT/DELETE (fechar/reabrir periodo) passam a exigir admin.
drop policy if exists "authenticated insert" on public.closed_periods;
drop policy if exists "authenticated delete" on public.closed_periods;
create policy "admin insert" on public.closed_periods for insert to authenticated with check ((select public.is_admin()));
create policy "admin delete" on public.closed_periods for delete to authenticated using ((select public.is_admin()));

-- 4) motor de origem: so admin dispara a reclassificacao em massa. O auto-classify de venda nova
--    usa apply_origin_rules_one (grant so service_role) -> caminho separado, INTOCADO. Fecha o
--    reapply_all direto p/ authenticated + guarda os 2 wrappers (que rodam como definer/postgres,
--    entao o revoke do core nao os cobre). Servico (auth.uid() null) segue passando.
revoke execute on function public.reapply_all() from authenticated;

create or replace function public.apply_origin_rules()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not (select public.is_admin()) then
    raise exception 'Apenas admin pode reclassificar origens.';
  end if;
  return public.reapply_all();
end $$;

create or replace function public.force_apply_origin_rule(p_rule_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not (select public.is_admin()) then
    raise exception 'Apenas admin pode reclassificar origens.';
  end if;
  return public.reapply_all();
end $$;
