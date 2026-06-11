-- Adiciona coluna role a profiles: 'admin' (padrão) ou 'viewer' (só leitura).
-- Todos os usuários existentes (Luiz + Lívia) recebem 'admin' pelo default.
-- A Edge Function user-management usa essa coluna para autorizar operações.
--
-- APLICADA: 2026-06-11 (version 20260611142142)

alter table public.profiles
  add column role text not null default 'admin'
  check (role in ('admin', 'viewer'));
