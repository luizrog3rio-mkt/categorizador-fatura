-- partidas_estrutura — vínculo conta bancária→contábil + tabela `partidas` (Fases 6a/6b)
-- ============================================================================================
-- STATUS: ✅ APLICADA em 2026-07-16 (version 20260716143144), aprovada pelo Luiz.
--   Smoke: 6 contas bancárias vinculadas (0 sem vínculo). TESTE DA CONSTRAINT (dado real, limpo depois):
--   par que fecha (D100/C100) PASSOU; partida SOLTA (D50) foi BARRADA → partida dobrada enforçada no
--   banco, como manda a regra inviolável #2 do prompt.
-- ============================================================================================
--
-- CONTEXTO: é o núcleo do "caminho A" (partida dobrada) que o POC validou (partidas reproduzem a
--   DRE ao centavo, 0 diff nas 3 empresas). Esta migration é SÓ ESTRUTURA — não cria nenhuma
--   partida (o backfill do histórico é a 6c, separada e verificável).
--
-- 6a) `accounts.conta_contabil_id` — toda conta bancária É uma conta patrimonial (o prompt previa
--     `contas_bancarias.conta_contabil_id`). Sem isso não há contrapartida de caixa. Backfill 1:1
--     verificado (dry-run): checking/cash → conta "Caixa…" (asset) da MESMA empresa; credit_card →
--     `2.1.09 Cartões de crédito a pagar` (liability — cartão NÃO é caixa, é dívida). 6 contas, 0 ambíguas.
--
-- 6b) `partidas` — o razão. Uma partida = um lado (débito|crédito) de um lançamento, numa conta.
--     `entry_id` → entries (o lançamento já existe e tem empresa/datas/descrição; NÃO duplico numa
--     tabela `lancamentos` nova — decisão do "faseado rumo a A"). Dimensões (obra/produto) seguem
--     no entry por ora — as partidas herdam; se um dia precisar ratear POR partida, adiciona-se aqui.
--
--     ⚖️ BALANCEAMENTO no banco (regra inviolável #2 do prompt: "toda partida dobrada fecha,
--     constraint no banco, não na app"): constraint trigger DEFERRABLE INITIALLY DEFERRED valida
--     SUM(débito)=SUM(crédito) por lançamento no COMMIT — assim as 2 partidas podem entrar em
--     qualquer ordem dentro da transação. Lançamento com 0 partidas passa (0=0) — é o gap dos que
--     ainda não têm conta/banco definidos, que ficam fora do razão até serem resolvidos.
--
-- NEUTRO PARA A DRE: nenhuma RPC de DRE lê `partidas` nem `accounts.conta_contabil_id`. A DRE segue
--   lendo entries/cartão/Hotmart exatamente como hoje. As duas visões convivem até o portão F5.
--
-- ROLLBACK: drop table partidas + drop function partidas_balanceiam + drop column conta_contabil_id.

-- ─────────────────────────────── 6a — vínculo banco → contábil ───────────────────────────────
alter table public.accounts
  add column if not exists conta_contabil_id uuid references public.chart_of_accounts(id) on delete set null;

update public.accounts a
set conta_contabil_id = c.id
from public.chart_of_accounts c
where c.company_id = a.company_id and c.tipo = 'patrimonial'
  and a.type in ('checking','cash') and c.nature = 'asset' and c.name ~* '^caixa'
  and a.conta_contabil_id is null;

update public.accounts a
set conta_contabil_id = c.id
from public.chart_of_accounts c
where c.company_id = a.company_id and c.tipo = 'patrimonial'
  and a.type = 'credit_card' and c.nature = 'liability' and c.code = '2.1.09'
  and a.conta_contabil_id is null;

create index if not exists idx_accounts_conta_contabil
  on public.accounts (conta_contabil_id) where conta_contabil_id is not null;

-- ─────────────────────────────── 6b — o razão (partidas) ───────────────────────────────
create table public.partidas (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.entries(id) on delete cascade,
  conta_id    uuid not null references public.chart_of_accounts(id) on delete restrict,
  natureza    text not null check (natureza in ('debito','credito')),
  valor       numeric(14,2) not null check (valor > 0),
  memo        text,
  created_at  timestamptz not null default now()
);

create index idx_partidas_entry on public.partidas (entry_id);
create index idx_partidas_conta on public.partidas (conta_id);

alter table public.partidas enable row level security;
create policy partidas_sel on public.partidas for select to authenticated using (true);
create policy partidas_ins on public.partidas for insert to authenticated with check ((select public.is_admin()));
create policy partidas_upd on public.partidas for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy partidas_del on public.partidas for delete to authenticated using ((select public.is_admin()));
grant select, insert, update, delete on public.partidas to authenticated, service_role;

-- Balanceamento: débito = crédito por lançamento, validado no COMMIT (deferred).
create or replace function public.partidas_balanceiam()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_entry uuid; v_deb numeric; v_cred numeric;
begin
  v_entry := coalesce(new.entry_id, old.entry_id);
  select coalesce(sum(valor) filter (where natureza = 'debito'), 0),
         coalesce(sum(valor) filter (where natureza = 'credito'), 0)
    into v_deb, v_cred
  from public.partidas where entry_id = v_entry;
  if v_deb <> v_cred then
    raise exception 'Partidas do lançamento % não fecham: débito % <> crédito %', v_entry, v_deb, v_cred
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger trg_partidas_balanceiam
  after insert or update or delete on public.partidas
  deferrable initially deferred
  for each row execute function public.partidas_balanceiam();
