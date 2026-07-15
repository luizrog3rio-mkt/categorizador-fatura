-- balanco_digital — contas patrimoniais (Balanço) da RB7 DIGITAL (Fase 2a do roadmap DRE/Balanço)
-- ============================================================================================
-- STATUS: ✅ APLICADA em 2026-07-15 (version 20260715215959), aprovada pelo Luiz.
--   Verificação adversarial de 4 agentes = 0 blockers (DRE byte-idêntica: RISCO1=0, RISCO2=diff de 1 token).
--   Smoke pós-apply: 50 contas patrimoniais (40 folhas, 10 grupos, 3 raízes), DRE das 3 empresas inalterada
--   (diff R$0,00), 0 patrimoniais aparecendo na DRE (filtro tipo=resultado). Acompanha ajuste de front:
--   os seletores de classificação (Lancamentos/Fatura) passaram a filtrar tipo=resultado (não expõem patrimoniais).
-- ============================================================================================
--
-- O QUE FAZ:
--   (1) Seed das 50 contas de Balanço da Digital (aba "Balanço Patrimonial" da planilha):
--       ATIVO (asset) / PASSIVO (liability) / PATRIMÔNIO LÍQUIDO (equity). company_id = Digital,
--       tipo = 'patrimonial'. Redutoras: 1.4.07 (deprec. acum.), 1.5.03 (amort. acum.), 3.5
--       (distribuição de lucros). Deriva parent_id (hierarquia do código), is_analytical (folha),
--       sort_order (segmentos do código). Códigos 1/2/3 NÃO colidem com a DRE (tipo diferente +
--       company_id Digital vs. null compartilhado; o unique é (company_id, tipo, code)).
--   (2) Recria dre_by_competency com UM ajuste: a listagem-esqueleto passa a filtrar
--       `coa.tipo = 'resultado'` — senão as contas patrimoniais novas apareceriam como linhas
--       ZERADAS na DRE (o CTE `mov` já ignora asset/liability/equity, mas a listagem `where active`
--       não). Follow-up previsto desde a Fase 1. **A DRE fica byte-idêntica** (o filtro só remove
--       linhas patrimoniais, que hoje somam 0 e não deveriam estar lá).
--
-- O QUE **NÃO** FAZ: não lança SALDO nenhum (as contas nascem vazias; os saldos vêm da partida
--   dobrada na Fase 6, ou de lançamentos de saldo inicial). Não toca entries/transactions. Não
--   cria o Balanço da Holding/Incorporadora (Fases 2b/2c). Só a Digital.
--
-- NEUTRO PARA A DRE: verificado no smoke (diff pré/pós = R$0). O seed é aditivo; o ajuste da RPC
--   só exclui linhas patrimoniais (tipo≠resultado) da listagem.
--
-- ROLLBACK: restaurar dre_by_competency sem o filtro (versão anterior) + delete das contas
--   patrimoniais da Digital (nenhuma referenciada por lançamento ainda).

-- 1) SEED das contas patrimoniais da Digital.
insert into public.chart_of_accounts (company_id, tipo, code, name, nature, redutora, is_analytical, sort_order, active)
select 'e16aa82e-b78a-46d2-bdb1-85ce03369a4f'::uuid, 'patrimonial', v.code, v.name, v.nature, v.redutora,
       true,
       split_part(v.code,'.',1)::int*1000000
         + coalesce(nullif(split_part(v.code,'.',2),'')::int,0)*1000
         + coalesce(nullif(split_part(v.code,'.',3),'')::int,0),
       true
from (values
  ('1','ATIVO','asset',false),
  ('1.1','Ativo Circulante','asset',false),
  ('1.1.01','Caixa e equivalentes (Sicoob, C6, aplicações)','asset',false),
  ('1.1.02','Contas a receber — plataformas (Hotmart/TMB)','asset',false),
  ('1.1.03','Cartões / adquirência a receber','asset',false),
  ('1.1.04','Adiantamentos a fornecedores','asset',false),
  ('1.1.05','Estoque de livros físicos','asset',false),
  ('1.1.06','Impostos a recuperar','asset',false),
  ('1.2','Ativo Não Circulante — Realizável a LP','asset',false),
  ('1.2.01','Consórcio a Contemplar (fundo + reserva)','asset',false),
  ('1.2.02','Depósitos judiciais / cauções','asset',false),
  ('1.2.03','Créditos com partes relacionadas','asset',false),
  ('1.3','Investimentos','asset',false),
  ('1.3.01','Participações societárias em outras empresas','asset',false),
  ('1.4','Imobilizado','asset',false),
  ('1.4.01','Máquinas, equipamentos e estúdio','asset',false),
  ('1.4.02','Móveis e utensílios','asset',false),
  ('1.4.03','Computadores e periféricos','asset',false),
  ('1.4.04','Veículos','asset',false),
  ('1.4.05','Bens adquiridos via consórcio (contemplado)','asset',false),
  ('1.4.06','Imóveis','asset',false),
  ('1.4.07','(-) Depreciação acumulada','asset',true),
  ('1.5','Intangível','asset',false),
  ('1.5.01','Softwares e licenças','asset',false),
  ('1.5.02','Marca e propriedade intelectual','asset',false),
  ('1.5.03','(-) Amortização acumulada','asset',true),
  ('2','PASSIVO','liability',false),
  ('2.1','Passivo Circulante','liability',false),
  ('2.1.01','Fornecedores a pagar','liability',false),
  ('2.1.02','Comissões a pagar (afiliados / closers)','liability',false),
  ('2.1.03','Salários e pró-labore a pagar','liability',false),
  ('2.1.04','Provisão de férias e 13º','liability',false),
  ('2.1.05','INSS / FGTS a recolher','liability',false),
  ('2.1.06','Impostos sobre vendas a recolher (ISS/ICMS)','liability',false),
  ('2.1.07','IRPJ / CSLL a recolher','liability',false),
  ('2.1.08','Reembolsos a pagar (provisão)','liability',false),
  ('2.1.09','Cartões de crédito a pagar (Bradesco, C6)','liability',false),
  ('2.1.10','Adiantamentos de clientes','liability',false),
  ('2.1.11','Empréstimos e financiamentos — curto prazo','liability',false),
  ('2.2','Passivo Não Circulante','liability',false),
  ('2.2.01','Empréstimos e financiamentos — longo prazo','liability',false),
  ('2.2.02','Parcelamentos tributários','liability',false),
  ('2.2.03','Provisões de longo prazo','liability',false),
  ('2.2.04','Débitos com partes relacionadas','liability',false),
  ('3','PATRIMÔNIO LÍQUIDO','equity',false),
  ('3.1','Capital Social','equity',false),
  ('3.2','Reservas de lucros','equity',false),
  ('3.3','Lucros ou prejuízos acumulados','equity',false),
  ('3.4','Resultado do exercício (vem da DRE)','equity',false),
  ('3.5','(-) Distribuição de lucros aos sócios','equity',true)
) as v(code, name, nature, redutora);

-- 2) parent_id pela hierarquia de código (escopo Digital/patrimonial).
update public.chart_of_accounts c
set parent_id = p.id
from public.chart_of_accounts p
where c.company_id = 'e16aa82e-b78a-46d2-bdb1-85ce03369a4f' and c.tipo = 'patrimonial' and c.code ~ '\.'
  and p.company_id = 'e16aa82e-b78a-46d2-bdb1-85ce03369a4f' and p.tipo = 'patrimonial'
  and p.code = regexp_replace(c.code, '\.[^.]+$', '');

-- 3) is_analytical = false para quem tem filho (os grupos).
update public.chart_of_accounts c
set is_analytical = false
where c.company_id = 'e16aa82e-b78a-46d2-bdb1-85ce03369a4f' and c.tipo = 'patrimonial'
  and exists (
    select 1 from public.chart_of_accounts f
    where f.company_id = 'e16aa82e-b78a-46d2-bdb1-85ce03369a4f' and f.tipo = 'patrimonial' and f.parent_id = c.id
  );

-- 4) dre_by_competency: idêntica, + filtro `coa.tipo = 'resultado'` na listagem-esqueleto
--    (impede as contas patrimoniais novas de aparecerem como linhas zeradas na DRE).
create or replace function public.dre_by_competency(p_company_id uuid, p_year integer, p_month_from integer default 1, p_month_to integer default 12)
 returns table(account_code text, account_name text, parent_code text, nature text, is_analytical boolean, sort_order integer, m1 numeric, m2 numeric, m3 numeric, m4 numeric, m5 numeric, m6 numeric, m7 numeric, m8 numeric, m9 numeric, m10 numeric, m11 numeric, m12 numeric, total numeric)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  return query
  with mov as (
    select e.chart_of_account_id as coa_id,
           extract(month from coalesce(e.competency_date, e.issue_date, e.due_date))::int as mes, e.amount as valor
    from public.entries e
    join public.chart_of_accounts c on c.id = e.chart_of_account_id
    where e.company_id = p_company_id and e.invoice_account_id is null
      and e.status not in ('cancelled','refunded')
      and coalesce(e.competency_date, e.issue_date, e.due_date) is not null
      and extract(year from coalesce(e.competency_date, e.issue_date, e.due_date))::int = p_year
      and extract(month from coalesce(e.competency_date, e.issue_date, e.due_date))::int between p_month_from and p_month_to
      and ((c.nature in ('revenue','deduction') and e.type = 'receivable')
        or (c.nature in ('variable_cost','fixed_cost','financial','depreciation','tax') and e.type = 'payable'))
    union all
    select t.chart_of_account_id, extract(month from to_date(t.date,'DD/MM/YYYY'))::int,
           case when t.kind='credit' then -t.amount else t.amount end
    from public.transactions t
    join public.invoices i on i.id = t.invoice_id
    join public.accounts a on a.id = i.account_id
    join public.chart_of_accounts c2 on c2.id = t.chart_of_account_id
    where a.company_id = p_company_id and t.chart_of_account_id is not null
      and c2.nature in ('variable_cost','fixed_cost','financial','depreciation','tax')
      and t.date ~ '^\d{2}/\d{2}/\d{4}$'
      and extract(year from to_date(t.date,'DD/MM/YYYY'))::int = p_year
      and extract(month from to_date(t.date,'DD/MM/YYYY'))::int between p_month_from and p_month_to
    union all
    select coalesce(pm.chart_of_account_id, dp.chart_of_account_id), extract(month from h.sale_date)::int, h.gross_amount
    from public.hotmart_sales h
    join public.hotmart_product_map pm on pm.product_id = h.product_id
    left join public.dre_products dp on dp.id = pm.dre_product_id
    where coalesce(pm.chart_of_account_id, dp.chart_of_account_id) is not null
      and h.company_id = p_company_id and h.currency = 'BRL'
      and h.status ~* 'aprovad|complet|conclu|approved' and h.sale_date is not null
      and extract(year from h.sale_date)::int = p_year
      and extract(month from h.sale_date)::int between p_month_from and p_month_to
  ),
  hot as (
    select extract(month from h.sale_date)::int as mes,
           case when coalesce(pm.chart_of_account_id, dp.chart_of_account_id) is not null then 0::numeric else h.gross_amount end as gross,
           h.hotmart_fee as fee,
           coalesce(h.affiliate_commission,0) + coalesce(h.coproduction_commission,0) as com
    from public.hotmart_sales h
    left join public.hotmart_product_map pm on pm.product_id = h.product_id
    left join public.dre_products dp on dp.id = pm.dre_product_id
    where h.company_id = p_company_id and h.currency = 'BRL'
      and h.status ~* 'aprovad|complet|conclu|approved' and h.sale_date is not null
      and extract(year from h.sale_date)::int = p_year
      and extract(month from h.sale_date)::int between p_month_from and p_month_to
  ),
  naoclass as (
    select extract(month from coalesce(e.competency_date, e.issue_date, e.due_date))::int as mes,
           e.type::text as tp, e.amount as valor
    from public.entries e
    where e.company_id = p_company_id and e.invoice_account_id is null and e.transfer_id is null
      and e.chart_of_account_id is null
      and e.status not in ('cancelled','refunded')
      and coalesce(e.competency_date, e.issue_date, e.due_date) is not null
      and extract(year from coalesce(e.competency_date, e.issue_date, e.due_date))::int = p_year
      and extract(month from coalesce(e.competency_date, e.issue_date, e.due_date))::int between p_month_from and p_month_to
    union all
    select extract(month from to_date(t.date,'DD/MM/YYYY'))::int, 'payable'::text,
           case when t.kind='credit' then -t.amount else t.amount end
    from public.transactions t
    join public.invoices i on i.id = t.invoice_id
    join public.accounts a on a.id = i.account_id
    where a.company_id = p_company_id and t.chart_of_account_id is null
      and t.date ~ '^\d{2}/\d{2}/\d{4}$'
      and extract(year from to_date(t.date,'DD/MM/YYYY'))::int = p_year
      and extract(month from to_date(t.date,'DD/MM/YYYY'))::int between p_month_from and p_month_to
  )
  select coa.code, coa.name, parent.code, coa.nature, coa.is_analytical, coa.sort_order,
    coalesce(sum(m.valor) filter (where m.mes=1),0::numeric),  coalesce(sum(m.valor) filter (where m.mes=2),0::numeric),
    coalesce(sum(m.valor) filter (where m.mes=3),0::numeric),  coalesce(sum(m.valor) filter (where m.mes=4),0::numeric),
    coalesce(sum(m.valor) filter (where m.mes=5),0::numeric),  coalesce(sum(m.valor) filter (where m.mes=6),0::numeric),
    coalesce(sum(m.valor) filter (where m.mes=7),0::numeric),  coalesce(sum(m.valor) filter (where m.mes=8),0::numeric),
    coalesce(sum(m.valor) filter (where m.mes=9),0::numeric),  coalesce(sum(m.valor) filter (where m.mes=10),0::numeric),
    coalesce(sum(m.valor) filter (where m.mes=11),0::numeric), coalesce(sum(m.valor) filter (where m.mes=12),0::numeric),
    coalesce(sum(m.valor),0::numeric)
  from public.chart_of_accounts coa
  left join public.chart_of_accounts parent on parent.id = coa.parent_id
  left join mov m on m.coa_id = coa.id
  where coa.active = true and coa.tipo = 'resultado'
  group by coa.id, coa.code, coa.name, parent.code, coa.nature, coa.is_analytical, coa.sort_order
  union all
  select v.code, v.name, null::text, v.nat, true, v.so,
    coalesce(sum(v.val) filter (where hot.mes=1),0::numeric),  coalesce(sum(v.val) filter (where hot.mes=2),0::numeric),
    coalesce(sum(v.val) filter (where hot.mes=3),0::numeric),  coalesce(sum(v.val) filter (where hot.mes=4),0::numeric),
    coalesce(sum(v.val) filter (where hot.mes=5),0::numeric),  coalesce(sum(v.val) filter (where hot.mes=6),0::numeric),
    coalesce(sum(v.val) filter (where hot.mes=7),0::numeric),  coalesce(sum(v.val) filter (where hot.mes=8),0::numeric),
    coalesce(sum(v.val) filter (where hot.mes=9),0::numeric),  coalesce(sum(v.val) filter (where hot.mes=10),0::numeric),
    coalesce(sum(v.val) filter (where hot.mes=11),0::numeric), coalesce(sum(v.val) filter (where hot.mes=12),0::numeric),
    coalesce(sum(v.val),0::numeric)
  from hot
  cross join lateral (values
    ('HOT-1','Vendas Hotmart (a classificar)','revenue',-3, hot.gross),
    ('HOT-2','(−) Taxa Hotmart','deduction',-2, hot.fee),
    ('HOT-3','(−) Comissões Hotmart','variable_cost',-1, hot.com)
  ) as v(code, name, nat, so, val)
  group by v.code, v.name, v.nat, v.so
  union all
  select v.code, v.name, null::text, v.nat, true, v.so,
    coalesce(sum(v.val) filter (where nc.mes=1),0::numeric),  coalesce(sum(v.val) filter (where nc.mes=2),0::numeric),
    coalesce(sum(v.val) filter (where nc.mes=3),0::numeric),  coalesce(sum(v.val) filter (where nc.mes=4),0::numeric),
    coalesce(sum(v.val) filter (where nc.mes=5),0::numeric),  coalesce(sum(v.val) filter (where nc.mes=6),0::numeric),
    coalesce(sum(v.val) filter (where nc.mes=7),0::numeric),  coalesce(sum(v.val) filter (where nc.mes=8),0::numeric),
    coalesce(sum(v.val) filter (where nc.mes=9),0::numeric),  coalesce(sum(v.val) filter (where nc.mes=10),0::numeric),
    coalesce(sum(v.val) filter (where nc.mes=11),0::numeric), coalesce(sum(v.val) filter (where nc.mes=12),0::numeric),
    coalesce(sum(v.val),0::numeric)
  from naoclass nc
  cross join lateral (values
    ('NC-1','(Receitas a classificar)','revenue', 9998, case when nc.tp='receivable' then nc.valor else 0::numeric end),
    ('NC-2','(Despesas a classificar)','variable_cost', 9999, case when nc.tp='payable' then nc.valor else 0::numeric end)
  ) as v(code, name, nat, so, val)
  group by v.code, v.name, v.nat, v.so
  order by 6, 1;
end; $function$;
