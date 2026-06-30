-- APLICADA: 20260630174246
-- Auditoria import/consistencia 2026-06-30: 6 entries com ano corrompido por typo (so 1 data de
-- cada linha; as irmas sao 2026). Salario Laila + DARF INSS (R$7.931,95, ambas com conta e status
-- valido) somiam da DRE-competencia por cair no ano 20226/20026; 2 payment_date furavam o fluxo de
-- caixa. O CHECK entries_datas_sanas era NOT VALID (nunca varreu os antigos). Corrige as 6 -> 2026
-- e torna o CHECK retroativo. Aprovado pelo Luiz em 2026-06-30 (anos confirmados pelas datas-irmas).
-- Verificado: 0 datas-lixo restantes, CHECK convalidated=true, R$7.932 recuperados na competencia.
update public.entries set issue_date='2026-04-30'      where id='245b2dc7-7002-4e39-b2cb-0d44d238af21'; -- COMISSAO MAIKOM (era 0006-04-30)
update public.entries set payment_date='2026-05-27'    where id='cd52d78f-428c-4522-baea-0dd59acc7168'; -- CONTA DE AGUA (era 0226-05-27)
update public.entries set competency_date='2026-06-30' where id='52ae36ef-0ffa-4dc4-9304-618c1c65ee84'; -- DARF INSS (era 20026-06-30)
update public.entries set payment_date='2026-05-28'    where id='bfda94d7-2c01-4659-9b9d-45a9d8e32070'; -- DARF IRPJ (era 20226-05-28)
update public.entries set issue_date='2026-04-30'      where id='bd1ec652-e3b4-4938-9a75-54b64fda4534'; -- PJ SALARIO IVENS (era 20226-04-30)
update public.entries set competency_date='2026-06-30' where id='52591131-d1cf-4373-aaef-0371cd776b96'; -- SALARIO LAILA (era 20226-06-30)
alter table public.entries validate constraint entries_datas_sanas;
