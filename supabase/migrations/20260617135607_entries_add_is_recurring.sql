-- APLICADA: 20260617135607 (arquivo renomeado de ...000000 na auditoria 2026-06-30 p/ casar a version real)
-- Adiciona flag de recorrência nas entradas financeiras.
-- Ao marcar como pago, o front cria automaticamente o lançamento do próximo mês.
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;
