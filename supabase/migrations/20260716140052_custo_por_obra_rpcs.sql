-- custo_por_obra_rpcs — relatório de custo por obra + candidatos a vínculo (Fase 4b-1)
-- ============================================================================================
-- STATUS: ✅ APLICADA em 2026-07-16 (version 20260716140052). Read-only/aditiva (2 funções novas).
--   Verificado antes do apply (queries equivalentes): custo_por_obra lista as 2 obras mesmo sem custo
--   (LEFT JOIN ok); obra_candidatos = 136 linhas para 136 entries distintos, 0 descrições casando 2
--   obras (sem duplicata). Pós-apply: RPCs vivas (2 obras / 136 candidatos / R$218.036,55).
-- ============================================================================================
--
-- CONTEXTO: a Fase 4a criou `obras` (Cristais/Alfenas) + `entries.obra_id`, mas o Luiz recusou o
--   backfill cego dos ~135 lançamentos ("quero revisar e marcar via UI"). Hoje: 0 marcados,
--   136 candidatos (R$218k) cuja descrição nomeia a obra. Estas 2 RPCs alimentam a tela que
--   deixa ELE revisar e vincular — o sistema propõe, o humano decide (regra do prompt).
--
-- O QUE FAZ (2 RPCs READ-ONLY; nenhuma escrita, nenhum dado mutado):
--   • custo_por_obra(p_company) — custo acumulado por obra, quebrado por conta (item de custo).
--     Inclui obras sem custo (LEFT JOIN) e o balde '(a classificar)' das que não têm conta.
--   • obra_candidatos(p_company) — lançamentos SEM obra cuja descrição casa o nome de uma obra
--     (sugestão factual, não decisão). O vínculo em si é UPDATE do front, revisado pelo humano.
--
-- NEUTRO PARA A DRE: nenhuma das 4 RPCs de DRE lê obra_id; estas 2 são read-only e novas.
--   ⚠️ Enquanto a obra está em_andamento, o custo dela é ESTOQUE (ativo) e NÃO deve ir à DRE —
--   isso é a Fase 4b-2 (conta de estoque + evento de venda → CPV). Hoje esses lançamentos ainda
--   caem na DRE como despesa comum (comportamento atual preservado; a mudança vem com decisão).
--
-- ROLLBACK: drop das 2 funções (nada mais é tocado).

create or replace function public.custo_por_obra(p_company uuid)
returns table(obra_id uuid, obra text, status text, data_venda date,
              conta_code text, conta_name text, valor numeric, qtd bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.nome, o.status, o.data_venda,
         coalesce(c.code, '(sem conta)') as conta_code,
         coalesce(c.name, '(a classificar)') as conta_name,
         coalesce(sum(e.amount), 0::numeric) as valor,
         count(e.id) as qtd
  from public.obras o
  left join public.entries e
    on e.obra_id = o.id and e.status not in ('cancelled','refunded')
  left join public.chart_of_accounts c on c.id = e.chart_of_account_id
  where o.company_id = p_company
  group by o.id, o.nome, o.status, o.data_venda, c.code, c.name
  order by o.nome, coalesce(c.code, 'zzz');
$$;

revoke all on function public.custo_por_obra(uuid) from public, anon;
grant execute on function public.custo_por_obra(uuid) to authenticated, service_role;

create or replace function public.obra_candidatos(p_company uuid)
returns table(entry_id uuid, descricao text, valor numeric, data date, empresa text,
              conta_code text, obra_id uuid, obra_sugerida text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.description, e.amount,
         coalesce(e.competency_date, e.due_date) as data,
         co.name as empresa,
         c.code as conta_code,
         o.id as obra_id, o.nome as obra_sugerida
  from public.entries e
  join public.companies co on co.id = e.company_id
  join public.obras o on o.company_id = p_company and e.description ~* o.nome
  left join public.chart_of_accounts c on c.id = e.chart_of_account_id
  where e.obra_id is null
    and e.status not in ('cancelled','refunded')
    and e.transfer_id is null
  order by e.amount desc;
$$;

revoke all on function public.obra_candidatos(uuid) from public, anon;
grant execute on function public.obra_candidatos(uuid) to authenticated, service_role;
