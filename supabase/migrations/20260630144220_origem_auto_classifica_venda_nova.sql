-- APLICADA: 20260630144220
-- Auditoria 2026-06-30: nao havia trigger de classificacao no INSERT de hotmart_sales ->
-- toda venda nova (webhook/sync) ficava 'a_classificar' ate alguem mexer numa regra, mesmo
-- quando uma regra ja casaria; relatorios por grupo/vendedor sub-contavam as recentes
-- silenciosamente. Fix: classificacao incremental (1 venda) com a MESMA logica de precedencia
-- da reapply_all (mais especifica vence, empate por created_at, NUNCA clobbera source='manual')
-- + trigger AFTER INSERT defensivo (erro de classificacao nunca bloqueia a gravacao da venda)
-- + reapply_all() de catch-up no fim. Aprovado pelo Luiz em 2026-06-30.
-- Verificado: insert transacional com src casando regra -> classificou no grupo/vendedor certo,
-- rollback limpo; trigger instalado; catch-up classificou os acumulados.
-- NOTA: AFTER INSERT casa por src/sck/xcod ja gravados; regra so-de-afiliado (preenchido depois
-- pelo refresh_commissions) ainda depende do reapply na proxima mudanca de regra. channel_id segue
-- aqui so por paridade com reapply_all -- sai junto na futura limpeza do cluster CANAL.
create or replace function public.apply_origin_rules_one(p_tx text)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if exists (select 1 from public.hotmart_sale_class where transaction_code = p_tx and source = 'manual') then
    return;
  end if;
  with matched as (
    select distinct on (hs.transaction_code)
      hs.transaction_code, r.id as rule_id, r.group_id, r.channel_id, r.seller_id
    from public.hotmart_sales hs
    join public.origin_tracking_rules r on
      (case r.src_match
        when 'is_empty'    then (hs.src is null or hs.src = '')
        when 'contains'    then r.src_value is not null and hs.src ilike '%' || r.src_value || '%'
        when 'starts_with' then r.src_value is not null and hs.src ilike r.src_value || '%'
        else r.src_value is null or hs.src = r.src_value end) and
      (case r.sck_match
        when 'is_empty'    then (hs.sck is null or hs.sck = '')
        when 'contains'    then r.sck_value is not null and hs.sck ilike '%' || r.sck_value || '%'
        when 'starts_with' then r.sck_value is not null and hs.sck ilike r.sck_value || '%'
        else r.sck_value is null or hs.sck = r.sck_value end) and
      (case r.xcode_match
        when 'is_empty'    then (hs.xcod is null or hs.xcod = '')
        when 'contains'    then r.xcode_value is not null and hs.xcod ilike '%' || r.xcode_value || '%'
        when 'starts_with' then r.xcode_value is not null and hs.xcod ilike r.xcode_value || '%'
        else r.xcode_value is null or hs.xcod = r.xcode_value end) and
      (case r.afiliado_match
        when 'is_empty'    then (hs.affiliate is null or hs.affiliate = '')
        when 'contains'    then r.afiliado_value is not null and hs.affiliate ilike '%' || r.afiliado_value || '%'
        when 'starts_with' then r.afiliado_value is not null and hs.affiliate ilike r.afiliado_value || '%'
        else r.afiliado_value is null or hs.affiliate = r.afiliado_value end)
    where hs.transaction_code = p_tx
    order by hs.transaction_code,
      (case when r.src_value is not null or r.src_match = 'is_empty' then 1 else 0 end +
       case when r.sck_value is not null or r.sck_match = 'is_empty' then 1 else 0 end +
       case when r.xcode_value is not null or r.xcode_match = 'is_empty' then 1 else 0 end +
       case when r.afiliado_value is not null or r.afiliado_match = 'is_empty' then 1 else 0 end) desc,
      r.created_at asc
  )
  insert into public.hotmart_sale_class (transaction_code, group_id, channel_id, seller_id, source, applied_by_rule, updated_at)
  select transaction_code, group_id, channel_id, seller_id, 'rule', rule_id, now() from matched
  on conflict (transaction_code) do update
    set group_id = excluded.group_id, channel_id = excluded.channel_id,
        seller_id = excluded.seller_id, source = 'rule',
        applied_by_rule = excluded.applied_by_rule, updated_at = excluded.updated_at
    where public.hotmart_sale_class.source <> 'manual';
end; $function$;

create or replace function public.trg_classify_new_sale()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  begin
    perform public.apply_origin_rules_one(new.transaction_code);
  exception when others then
    raise warning 'classify_new_sale falhou p/ %: %', new.transaction_code, sqlerrm;
  end;
  return null;
end; $function$;

drop trigger if exists trg_hotmart_classify_new on public.hotmart_sales;
create trigger trg_hotmart_classify_new
  after insert on public.hotmart_sales
  for each row execute function public.trg_classify_new_sale();

select public.reapply_all();
