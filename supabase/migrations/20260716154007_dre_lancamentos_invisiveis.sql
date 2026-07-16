-- dre_lancamentos_invisiveis — alerta: lançamento TEM conta mas some da DRE
-- ============================================================================================
-- STATUS: ✅ APLICADA em 2026-07-16 (version 20260716154007), a pedido do Luiz ("cria o alerta dos
--   lançamentos que somem da DRE"). Read-only/aditiva (1 função nova). Pós-apply na Digital:
--   16 entries (R$85.828,30) + 7 linhas de cartão (R$92,92); campeãs "1.1.02 Apruma (11),
--   1.1.03 Trampolim (3), 1.1.04 Colheita (1)". Alert (tom danger) nas telas DRE e DRE por Produto.
-- ============================================================================================
--
-- O PROBLEMA (irmão do bug da dedução, achado na mesma investigação): a DRE só soma o lançamento
--   quando a NATUREZA da conta casa com o TIPO do lançamento. Se não casa, ele não entra em `mov`
--   E também não entra em `naoclass` (que exige chart_of_account_id NULL) → **evapora em silêncio**.
--   Diferente do balde "(A classificar)", que é visível, este some sem deixar rastro na tela.
--
--   Hoje (Digital, pós-fix da dedução): ~R$85.921 invisíveis —
--     • `payable` em conta de RECEITA: 1.1.02 Apruma R$71.010,84; 1.1.03 Trampolim; 1.1.04 Colheita
--       (um pagamento não pode virar receita → é erro de classificação, não dá p/ "incluir e pronto")
--     • `2.4.03 REEMBOLSO DE TRÁFEGO` R$4.067,46 — a conta está sob Deduções mas tem nature='revenue'
--       (bug de cadastro já registrado no de-para do F0; corrigir a nature resolve estes)
--     • 7 linhas de CARTÃO em `2.3.01 Taxa de Cartão` (deduction): o braço do cartão do `mov` só
--       aceita nature de custo (guarda anti receita-fantasma, intencional) → dedução no cartão some.
--
-- O QUE FAZ: RPC READ-ONLY que conta/soma esses lançamentos (entries + cartão) e resume as contas
--   campeãs, no mesmo molde do `dre_nao_classificado` (que alimenta o Alert de "(A classificar)").
--   O front mostra o Alert nas telas DRE e DRE por Produto. **Não corrige nada sozinho** — expõe,
--   porque a correção é decisão humana (reclassificar o lançamento ou consertar a nature da conta).
--
-- ESCOPO: só contas de RESULTADO (tipo='resultado'). Lançamento em conta PATRIMONIAL sai da DRE
--   DE PROPÓSITO (consórcio, imóveis, cartão a pagar, partes relacionadas) — é o comportamento
--   correto e NÃO é alertado.
--
-- NEUTRO: nenhuma mutação, nenhuma RPC existente alterada. ROLLBACK: drop function.

create or replace function public.dre_lancamentos_invisiveis(p_company uuid)
returns table(qtd_entries bigint, valor_entries numeric, qtd_tx bigint, valor_tx numeric, contas text)
language sql
stable
security definer
set search_path = ''
as $$
  with inv_e as (
    select e.amount as valor, c.code, c.name
    from public.entries e
    join public.chart_of_accounts c on c.id = e.chart_of_account_id
    where e.company_id = p_company
      and e.status not in ('cancelled','refunded')
      and e.invoice_account_id is null
      and c.tipo = 'resultado'
      and not ( (c.nature = 'revenue' and e.type = 'receivable')
             or (c.nature = 'deduction')
             or (c.nature in ('variable_cost','fixed_cost','financial','depreciation','tax') and e.type = 'payable') )
  ),
  inv_t as (
    select (case when t.kind = 'credit' then -t.amount else t.amount end) as valor, c.code, c.name
    from public.transactions t
    join public.invoices i on i.id = t.invoice_id
    join public.accounts a on a.id = i.account_id
    join public.chart_of_accounts c on c.id = t.chart_of_account_id
    where a.company_id = p_company
      and c.tipo = 'resultado'
      and c.nature not in ('variable_cost','fixed_cost','financial','depreciation','tax')
  )
  select
    (select count(*) from inv_e),
    (select coalesce(sum(valor), 0) from inv_e),
    (select count(*) from inv_t),
    (select coalesce(sum(valor), 0) from inv_t),
    (select string_agg(x.t, ', ') from (
       select u.code || ' ' || u.name || ' (' || count(*) || ')' as t
       from (select code, name, valor from inv_e union all select code, name, valor from inv_t) u
       group by u.code, u.name
       order by sum(u.valor) desc
       limit 3
     ) x);
$$;

revoke all on function public.dre_lancamentos_invisiveis(uuid) from public, anon;
grant execute on function public.dre_lancamentos_invisiveis(uuid) to authenticated, service_role;
