-- APLICADA 2026-06-17
-- Adiciona flag de recorrência nas entradas financeiras.
-- Ao marcar como pago, o front cria automaticamente o lançamento do próximo mês.
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;
