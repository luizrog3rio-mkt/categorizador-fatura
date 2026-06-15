-- APLICADA: 2026-06-15 (version 20260615132218)
-- Adiciona 'to_pay' ao enum entry_status.
-- Precisa ser uma migration separada: ADD VALUE não pode ser usado na mesma
-- transação que referencia o valor novo.
ALTER TYPE public.entry_status ADD VALUE IF NOT EXISTS 'to_pay' BEFORE 'pending';
