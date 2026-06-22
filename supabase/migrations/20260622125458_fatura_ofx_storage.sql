-- ============================================================================
-- Storage de arquivos OFX de fatura + invoices.ofx_path
-- ============================================================================
-- APLICADA em 2026-06-22 via MCP apply_migration — version vivo 20260622125458
-- (renomeado do placeholder 20260622000000, rito padrão). Pós-apply confirmado:
-- bucket privado faturas-ofx (10 MB), 1 policy, coluna invoices.ofx_path criada.
--
-- O que faz (numa única transação):
--   1. Cria o bucket de Storage PRIVADO `faturas-ofx` (limite 10 MB/arquivo)
--      pra guardar o .ofx original de cada importação de fatura de cartão.
--   2. Policy RLS modelo de EQUIPE em storage.objects, escopada ao bucket:
--      authenticated faz tudo (using/with check = bucket certo); anon nada
--      (sem policy = sem acesso, o bucket é privado). Mesmo desenho das
--      tabelas (Fase 1b/1c) — vai gerar 1 WARN rls_policy_always_true,
--      aceito por design.
--   3. Adiciona `invoices.ofx_path text` (nullable): caminho do arquivo no
--      bucket. As faturas já existentes ficam NULL (o .ofx delas foi
--      descartado no import antigo) — só importações novas preenchem.
--
-- O que NÃO faz: não migra/backfill arquivo nenhum (não há); não restringe
--   mime types (OFX chega com content-type variado — text/plain, octet-stream;
--   restringir bloquearia uploads legítimos).
-- ============================================================================

-- ── 1. Bucket privado ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('faturas-ofx', 'faturas-ofx', false, 10485760);

-- ── 2. RLS modelo de equipe, escopado ao bucket ─────────────────────────────
-- (storage.objects já tem RLS habilitado pelo Supabase; só criamos a policy)
create policy "Team manages all fatura ofx" on storage.objects
  for all to authenticated
  using (bucket_id = 'faturas-ofx')
  with check (bucket_id = 'faturas-ofx');

-- ── 3. Coluna do caminho na fatura ──────────────────────────────────────────
alter table public.invoices add column ofx_path text;
