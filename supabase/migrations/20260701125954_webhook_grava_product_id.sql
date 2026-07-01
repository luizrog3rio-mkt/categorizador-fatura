-- ============================================================================
-- apply_hotmart_webhook_event — grava product_id do webhook
-- ============================================================================
-- Fase 1.3 da reforma "produto por ID" (2026-07-01, pedido do Luiz).
-- APLICADA em 2026-07-01 — version 20260701125954.
--
-- O webhook 2.0 (derivação inline) passa a extrair data.product.id e gravá-lo em
-- hotmart_sales.product_id. 4 mudanças cirúrgicas (o resto é idêntico à versão
-- anterior): (1) declara v_pid; (2) extrai o id; (3) inclui product_id no INSERT;
-- (4) no ON CONFLICT usa coalesce(h.product_id, excluded.product_id) —
-- NÃO-destrutivo, um re-webhook não sobrescreve o id que o backfill já pôs.
-- Junto com o mapSale do edge (Fase 1.2), fecha a captura pra vendas novas.
-- ============================================================================

create or replace function public.apply_hotmart_webhook_event(p_event_id text)
 returns void language plpgsql set search_path to ''
as $function$
declare
  v        record;
  p        jsonb;  pur jsonb;  org jsonb;
  v_tx     text;   v_status text;  v_created timestamptz;  v_sale date;  v_money boolean;
  v_total  numeric;  v_gross numeric;  v_fee numeric;  v_net numeric;  v_cur text;
  v_pid    bigint;
begin
  update public.hotmart_webhook_events set processed_at = now()
    where dedupe_key = p_event_id and processed_at is null
  returning * into v;
  if not found then return; end if;

  p := v.payload;  pur := p #> '{data,purchase}';  org := pur -> 'origin';
  v_tx      := nullif(pur ->> 'transaction', '');
  v_created := to_timestamp((p ->> 'creation_date')::bigint / 1000.0);
  v_status  := public.hotmart_canonical_status(v.event, pur ->> 'status');

  if v_tx is null then
    return;
  end if;

  v_money := (pur #> '{price,value}') is not null;
  v_total := nullif(pur #>> '{price,value}', '')::numeric;
  v_gross := coalesce(nullif(pur #>> '{hotmart_fee,base}', '')::numeric, v_total, 0);
  v_fee   := coalesce(nullif(pur #>> '{hotmart_fee,total}', '')::numeric, 0);
  v_net   := v_gross - v_fee;
  v_cur   := coalesce(nullif(pur #>> '{price,currency_value}', ''),
                      nullif(pur #>> '{price,currency_code}', ''), 'BRL');
  v_pid   := nullif(p #>> '{data,product,id}', '')::bigint;
  v_sale  := coalesce(
    (to_timestamp(nullif(pur #>> '{order_date}', '')::bigint / 1000.0)    at time zone 'UTC')::date,
    (to_timestamp(nullif(pur #>> '{approved_date}', '')::bigint / 1000.0) at time zone 'UTC')::date,
    (v_created at time zone 'UTC')::date);

  insert into public.hotmart_sales as h (
    company_id, transaction_code, product, product_id, sale_date, currency,
    total_amount, gross_amount, hotmart_fee, net_amount,
    fee_percentage, installments, payment_method, status, buyer,
    sck, src, external_code, xcod, webhook_event_at
  ) values (
    v.company_id, v_tx, coalesce(nullif(p #>> '{data,product,name}', ''), 'Produto'), v_pid,
    v_sale, v_cur, coalesce(v_total, 0), v_gross, v_fee, v_net,
    nullif(pur #>> '{hotmart_fee,percentage}', '')::numeric,
    nullif(pur #>> '{payment,installments_number}', '')::int,
    nullif(pur #>> '{payment,type}', ''), v_status, nullif(p #>> '{data,buyer,name}', ''),
    nullif(trim(org ->> 'sck'), ''), nullif(trim(org ->> 'src'), ''),
    nullif(trim(org ->> 'external_code'), ''),
    coalesce(nullif(trim(org ->> 'xcode'), ''), nullif(trim(org ->> 'xcod'), '')),
    v_created
  )
  on conflict (transaction_code) do update set
    status = case
      when public.hotmart_is_terminal(h.status) then h.status
      when excluded.webhook_event_at >= coalesce(h.webhook_event_at, '-infinity'::timestamptz)
        then excluded.status
      else h.status end,
    webhook_event_at = greatest(coalesce(h.webhook_event_at, '-infinity'::timestamptz), excluded.webhook_event_at),
    product_id   = coalesce(h.product_id, excluded.product_id),
    total_amount = case when v_money then excluded.total_amount else h.total_amount end,
    gross_amount = case when v_money then excluded.gross_amount else h.gross_amount end,
    hotmart_fee  = case when v_money then excluded.hotmart_fee  else h.hotmart_fee  end,
    net_amount   = case when v_money then excluded.net_amount   else h.net_amount   end,
    currency     = case when v_money then excluded.currency     else h.currency     end,
    fee_percentage = coalesce(excluded.fee_percentage, h.fee_percentage),
    installments   = coalesce(excluded.installments,   h.installments),
    payment_method = coalesce(excluded.payment_method, h.payment_method),
    buyer          = coalesce(excluded.buyer, h.buyer),
    sck           = coalesce(h.sck, excluded.sck),
    src           = coalesce(h.src, excluded.src),
    external_code = coalesce(h.external_code, excluded.external_code),
    xcod          = coalesce(h.xcod, excluded.xcod);

exception when others then
  update public.hotmart_webhook_events
    set process_error = left(sqlerrm, 500), attempts = attempts + 1
    where dedupe_key = p_event_id;
end;
$function$;
