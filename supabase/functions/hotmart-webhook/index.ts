// ============================================================================
// Edge Function: hotmart-webhook
// ----------------------------------------------------------------------------
// Recebe o Webhook 2.0 da Hotmart em TEMPO REAL (venda nova, reembolso, chargeback,
// cancelamento) e grava o evento CRU em public.hotmart_webhook_events (durável),
// derivando pra public.hotmart_sales. O Postgres é a fila durável — sem Inngest/
// Trigger. Convive com os crons da API (hotmart-sync/refresh_status/commissions),
// que seguem donos do líquido exato e da reconciliação.
//
// Fluxo (ver docs/HOTMART-REFERENCIA.md §2.4/§2.5 e a migration hotmart_webhook_base):
//  1. valida o hottok (header x-hotmart-hottok; corpo como fallback) em tempo
//     constante e rejeita 401 ANTES de qualquer escrita;
//  2. persiste o cru de forma DURÁVEL e idempotente (upsert por dedupe_key);
//  3. deriva inline (best-effort) chamando a RPC apply_hotmart_webhook_event;
//  4. responde 200 assim que o cru é durável.
//
// ⚠️ Divergência consciente de docs/HOTMART-REFERENCIA.md §2.5.8 ("falha pós-cru →
//    5xx"): aqui só devolvemos 5xx se o PERSIST DO CRU falhar. Falha de DERIVAÇÃO
//    devolve 200 — o cron hotmart-webhook-drain (1 min) reprocessa. Motivo: a
//    Hotmart reenvia em não-2xx só 5× e depois AUTO-DESATIVA a config inteira; um
//    bug de derivação viraria blackout total. Tripla rede: inline → drain → API.
//
// Segurança:
//  - HOTMART_HOTTOK (token do painel) é SECRET da function. verify_jwt=false no
//    deploy (a Hotmart não manda JWT) — a autenticidade vem do hottok.
//  - Escreve com a SERVICE KEY (chamada externa sem usuário). A tabela de eventos
//    é service-only (RLS sem policy) porque o payload cru tem PII.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2.110.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hotmart-hottok',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// company da Hotmart (mesma que o cron do hotmart-sync usa); override por secret
const COMPANY_ID = Deno.env.get('HOTMART_WEBHOOK_COMPANY_ID') ?? 'e16aa82e-b78a-46d2-bdb1-85ce03369a4f'
const HOTTOK = Deno.env.get('HOTMART_HOTTOK') ?? ''

// Comparação em tempo constante: hash SHA-256 dos dois lados e XOR byte a byte
// (sem early-return), pra não vazar o segredo por timing.
async function constEq(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const x = new Uint8Array(ha)
  const y = new Uint8Array(hb)
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]
  return d === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'método não suportado' }, 405)

  try {
    if (!HOTTOK) return json({ error: 'HOTMART_HOTTOK não configurado' }, 500)

    const raw = await req.text()
    let payload: any
    try { payload = JSON.parse(raw) } catch { return json({ error: 'json inválido' }, 400) }

    // 1) hottok — header primeiro, corpo como fallback (payloads antigos). 401 antes de escrever.
    const got = req.headers.get('x-hotmart-hottok') ?? payload?.hottok ?? ''
    if (!(await constEq(String(got), HOTTOK))) return json({ error: 'hottok inválido' }, 401)

    const tx = payload?.data?.purchase?.transaction ?? null
    // dedupe_key nunca-NULL: payload.id (único por evento); fallback transaction:event
    const dedupe = payload?.id ?? (tx && payload?.event ? `${tx}:${payload.event}` : null)
    if (!dedupe) return json({ error: 'sem dedupe_key (payload.id/transaction ausentes)' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 2) persist cru DURÁVEL (idempotente). Só 5xx aqui → a Hotmart reentrega.
    const { error } = await sb
      .from('hotmart_webhook_events')
      .upsert(
        { dedupe_key: String(dedupe), event: payload?.event ?? null, transaction_code: tx, payload, company_id: COMPANY_ID },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
    if (error) return json({ error: 'falha ao persistir evento', detalhe: error.message }, 500)

    // 3) deriva inline (best-effort: erro fica em process_error; o drain de 1 min reprocessa)
    const { error: applyErr } = await sb.rpc('apply_hotmart_webhook_event', { p_event_id: String(dedupe) })

    // 4) 200 assim que durável (ver nota da divergência no topo)
    return json({ ok: true, dedupe_key: String(dedupe), derivado: !applyErr })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
