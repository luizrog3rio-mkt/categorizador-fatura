-- regras_sugestao_conta — motor de SUGESTÃO de conta p/ esvaziar o balde (Fase 5a do roadmap)
-- ============================================================================================
-- STATUS: ✅ APLICADA em 2026-07-15 (version 20260715202831), aprovada pelo Luiz.
--   Verificação adversarial de 4 agentes (SQL/RPC, neutralidade, app-de-pé, RLS) = 0 blockers.
--   Melhoria pós-review: ordenação prioriza itens COM sugestão (senão os classificáveis, de baixo
--   valor, cairiam no corte). Smoke pós-apply: 4 regras seed; sugerir_contas(Digital) → 64 sugestões
--   prontas (IOF/Tarifa→8.2, Pedágio→6.3.06); RPC read-only, DRE inalterada.
-- ============================================================================================
--
-- OBJETIVO: reduzir o balde de lançamentos SEM conta (NC-2, ~R$342k/mês na Digital) que distorce
--   a DRE. A ferramenta PROPÕE uma conta por regra de palavra-chave; o humano CONFIRMA e aplica
--   (nunca auto-classifica — respeita "o sistema propõe, não decide" do prompt). O apply em si
--   continua sendo o bulk de Conta DRE que já existe na tela Lançamentos; esta migration só cria
--   a base (regras + RPC de sugestão). A UI de classificação assistida é a Fase 5b (front).
--
-- SEED (só o INEQUÍVOCO/factual): IOF→Desp. Financeiras, Pedágio→Viagens, Tarifa bancária→Financeiras.
--   NÃO seedo SaaS (OpenAI/Zoom/Supabase…): "software fixo (6.4.02) × ferramenta variável (4.5)" é
--   JULGAMENTO que o prompt reserva ao humano — a lista fica proposta p/ o Luiz criar na UI.
--
-- NEUTRO PARA A DRE: nada é classificado aqui. `sugerir_contas` é read-only (não grava conta em
--   lançamento nenhum). A DRE não muda.
--
-- ROLLBACK: drop function sugerir_contas + drop table regras_conta.

-- 1) Tabela de regras (palavra-chave → conta sugerida). RLS team-read/admin-write (padrão do projeto).
create table public.regras_conta (
  id                   uuid primary key default gen_random_uuid(),
  padrao               text not null,
  match_type           text not null default 'contains' check (match_type in ('contains','starts_with','exact')),
  chart_of_account_id  uuid not null references public.chart_of_accounts(id) on delete cascade,
  aplica_em            text not null default 'ambos' check (aplica_em in ('entries','cartao','ambos')),
  company_id           uuid references public.companies(id) on delete cascade,  -- null = todas
  prioridade           int  not null default 100,   -- menor = avaliada primeiro
  ativa                boolean not null default true,
  created_at           timestamptz not null default now()
);

alter table public.regras_conta enable row level security;
create policy regras_conta_sel on public.regras_conta for select to authenticated using (true);
create policy regras_conta_ins on public.regras_conta for insert to authenticated with check ((select public.is_admin()));
create policy regras_conta_upd on public.regras_conta for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy regras_conta_del on public.regras_conta for delete to authenticated using ((select public.is_admin()));
grant select, insert, update, delete on public.regras_conta to authenticated, service_role;
create index idx_regras_conta_ativa on public.regras_conta (ativa) where ativa;
create index idx_regras_conta_coa on public.regras_conta (chart_of_account_id);
create index idx_regras_conta_company on public.regras_conta (company_id) where company_id is not null;

-- 2) RPC de sugestão (read-only): balde (entries + cartão sem conta) + a conta sugerida pela regra
--    ativa de maior prioridade que casa o texto. conta_id NULL = nenhuma regra casou.
create or replace function public.sugerir_contas(p_company uuid default null, p_limit int default 2000)
returns table (
  fonte text, id uuid, descricao text, valor numeric, data date, company_id uuid,
  conta_id uuid, conta_code text, conta_name text, regra_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with balde as (
    select 'entry'::text as fonte, e.id, e.description as descricao, e.amount as valor,
           coalesce(e.competency_date, e.issue_date, e.due_date) as data, e.company_id
    from public.entries e
    where e.chart_of_account_id is null and e.invoice_account_id is null and e.transfer_id is null
      and e.status not in ('cancelled','refunded')
      and (p_company is null or e.company_id = p_company)
    union all
    select 'cartao', t.id, t.memo,
           case when t.kind = 'credit' then -t.amount else t.amount end,
           case when t.date ~ '^\d{2}/\d{2}/\d{4}$' then to_date(t.date,'DD/MM/YYYY') else null end,
           a.company_id
    from public.transactions t
    join public.invoices i on i.id = t.invoice_id
    join public.accounts a on a.id = i.account_id
    where t.chart_of_account_id is null
      and (p_company is null or a.company_id = p_company)
  )
  select b.fonte, b.id, b.descricao, b.valor, b.data, b.company_id,
         r.chart_of_account_id, c.code, c.name, r.id
  from balde b
  left join lateral (
    select rc.id, rc.chart_of_account_id
    from public.regras_conta rc
    where rc.ativa
      and (rc.company_id is null or rc.company_id = b.company_id)
      and (rc.aplica_em = 'ambos'
           or rc.aplica_em = (case when b.fonte = 'cartao' then 'cartao' else 'entries' end))
      and (
        (rc.match_type = 'contains'    and b.descricao ilike '%' || rc.padrao || '%') or
        (rc.match_type = 'starts_with' and b.descricao ilike rc.padrao || '%') or
        (rc.match_type = 'exact'       and upper(btrim(b.descricao)) = upper(btrim(rc.padrao)))
      )
    order by rc.prioridade asc, length(rc.padrao) desc
    limit 1
  ) r on true
  left join public.chart_of_accounts c on c.id = r.chart_of_account_id
  -- itens COM sugestão primeiro (senão os classificáveis — financeiras/pedágio, de baixo
  -- valor — cairiam no corte por valor); depois por valor desc.
  order by (r.id is null), b.valor desc
  limit p_limit;
$$;
grant execute on function public.sugerir_contas(uuid, int) to authenticated;

-- 3) Seed SÓ das regras factuais (inequívocas). SaaS e demais julgamentos ficam p/ o Luiz na UI.
insert into public.regras_conta (padrao, match_type, chart_of_account_id, aplica_em, prioridade)
select v.padrao, 'contains', c.id, 'ambos', v.prio
from (values
  ('IOF',     '8.2',    10),   -- IOF operação exterior (cartão) — imposto financeiro
  ('TARIFA',  '8.2',    20),   -- tarifa/pacote bancário — despesa financeira
  ('PEDAGIO', '6.3.06', 30),   -- pedágio (tag) — viagens e deslocamentos
  ('PEDGIO',  '6.3.06', 30)    -- variante grafada nos extratos ("PEDGIO SICOOB")
) as v(padrao, code, prio)
join public.chart_of_accounts c on c.code = v.code and c.company_id is null and c.tipo = 'resultado';
