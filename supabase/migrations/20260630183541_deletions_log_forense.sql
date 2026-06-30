-- APLICADA: 20260630183541
-- Auditoria resiliencia 2026-06-30: DELETE em entries nao deixava rastro (o entry_audit_log so
-- cobre UPDATE, e o entry_id e CASCADE -> deletar a entry apaga junto o historico dela). Com RLS
-- using(true) qualquer membro deleta entry/fatura (cascade) sem trilha forense. Tabela separada
-- (sem FK -> sobrevive ao delete) + trigger BEFORE DELETE em entries e invoices capturando a linha
-- inteira como JSONB. Append-only (so o trigger definer escreve; time so le). Aprovado pelo Luiz
-- em 2026-06-30. (transactions de proposito fora: fatura grande cascatearia 1000+ logs; o snapshot
-- da invoice + o OFX no Storage recuperam.) Verificado: delete de teste capturou snapshot completo.
create table public.deletions_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  deleted_by uuid,
  deleted_at timestamptz not null default now(),
  snapshot jsonb not null
);
alter table public.deletions_log enable row level security;
create policy "team le deletions" on public.deletions_log for select to authenticated using (true);
grant select on public.deletions_log to authenticated;
create index idx_deletions_log_tbl_row on public.deletions_log(table_name, row_id);
create index idx_deletions_log_at on public.deletions_log(deleted_at desc);

create or replace function public.log_delecao()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  insert into public.deletions_log (table_name, row_id, deleted_by, snapshot)
  values (tg_table_name, old.id, auth.uid(), to_jsonb(old));
  return old;
end; $function$;
revoke execute on function public.log_delecao() from public;

create trigger trg_log_delecao_entries  before delete on public.entries  for each row execute function public.log_delecao();
create trigger trg_log_delecao_invoices before delete on public.invoices for each row execute function public.log_delecao();
