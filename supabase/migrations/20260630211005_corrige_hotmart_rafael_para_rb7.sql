-- APLICADA: 20260630211005
-- Auditoria 2026-06-30 (seletor "Empresa de destino" do Hotmart): 38 vendas (R$53.104, 27-30/
-- abr/2026) foram atribuidas a "RAFAEL BRITO - CONTA PESSOAL" por engano (provavel sync/import com
-- a destino na empresa errada). Provas: 100% dos 10 produtos tambem existem no RB7; o cron diario
-- sempre sincroniza pro RB7 DIGITAL; ha uma so conta Hotmart. Re-atribui pro RB7 DIGITAL. Aprovado
-- pelo Luiz em 2026-06-30. (transaction_code e unico global -> sem conflito; hotmart_sale_class e
-- por transaction_code -> nao afetado.) Verificado: RAFAEL ficou com 0; RB7 = 15.018 (R$6.265.506).
update public.hotmart_sales
set company_id = (select id from public.companies where name='RB7 DIGITAL')
where company_id = (select id from public.companies where name='RAFAEL BRITO - CONTA PESSOAL');
