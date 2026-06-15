-- APLICADA: 2026-06-15 (version 20260615132225)
-- Migra entradas 'overdue' para 'to_pay' e muda o default da coluna.
-- Fluxo novo (manual): to_pay → pending → paid  (ou cancelled em qualquer etapa).
-- 'overdue' permanece no enum (Postgres não permite remover) mas sai do fluxo da UI.

UPDATE public.entries
SET status = 'to_pay'
WHERE status = 'overdue';

ALTER TABLE public.entries
  ALTER COLUMN status SET DEFAULT 'to_pay';
