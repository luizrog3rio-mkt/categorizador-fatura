// ============================================================================
// Edge Function: hotmart-sync
// ----------------------------------------------------------------------------
// Sincroniza vendas da Hotmart (API) -> public.hotmart_sales, sem CSV.
//
// Segurança:
//  - HOTMART_CLIENT_ID / HOTMART_CLIENT_SECRET vivem como SECRETS da function
//    (nunca no frontend/bundle). A function pega o token OAuth server-to-server.
//  - A gravação usa o JWT do USUÁRIO logado (header Authorization repassado),
//    então respeita o RLS de equipe — sem precisar de service key.
//    ⚠️ As chaves JWT legadas foram desabilitadas no projeto, então o
//    SUPABASE_ANON_KEY auto-injetado está MORTO; usamos a publishable nova
//    (pública, a mesma do bundle) como apikey.
//
// Modos:
//  - POST {company_id, months?}            → usuário (JWT): upsert respeitando RLS
//  - POST {company_id, debug:true}         → 1ª venda crua+mapeada, NÃO grava
//  - header x-service-auth == HOTMART_SYNC_SERVICE_KEY → modo-serviço (cron
//    diário): escreve com a service key, sem usuário. verify_jwt=false no deploy.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const HOTMART_TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
const HOTMART_SALES_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'

// publishable key é PÚBLICA (já vai no bundle da Vercel) — o anon legado foi desabilitado
const PUBLISHABLE_KEY = 'sb_publishable_CYnY2cJ5mgmKJ4ZhV5IFcA_7mHEQhdo'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const isoDate = (ms: number | null | undefined) =>
  ms ? new Date(Number(ms)).toISOString().slice(0, 10) : null

// Mapeia uma venda da API pro shape de hotmart_sales.
// Estrutura confirmada via debug contra dados reais (2026-06-10):
//  - bruto: purchase.price.value
//  - taxa Hotmart: purchase.hotmart_fee.total (NÃO é um array de comissões)
//  - afiliado/coprodução: array `commissions` (quando há split; extraído de
//    forma defensiva — validar quando aparecer uma venda com afiliado)
//  - status em inglês maiúsculo (COMPLETE/APPROVED/...): a allowlist pega
function mapSale(it: any, companyId: string) {
  const p = it?.purchase ?? {}
  const code = p.transaction ?? it?.transaction
  if (!code) return null
  const sale_date = isoDate(p.order_date ?? p.approved_date)
  if (!sale_date) return null

  const gross = Number(p.price?.value ?? 0)
  const fee = Number(p.hotmart_fee?.total ?? 0)

  const commissions: any[] = Array.isArray(it?.commissions) ? it.commissions : []
  const soma = (re: RegExp) =>
    commissions.filter((c) => re.test(String(c?.source ?? ''))).reduce((s, c) => s + Number(c?.value ?? 0), 0)
  const affiliate = soma(/affiliate/i)
  const coproduction = soma(/co.?produc/i)
  const net = gross - fee - affiliate - coproduction

  return {
    transaction_code: String(code),
    product: it?.product?.name ?? 'Produto',
    sale_date,
    release_date: null, // sales/history não traz data de liberação/saque
    gross_amount: gross,
    hotmart_fee: fee,
    affiliate_commission: affiliate,
    coproduction_commission: coproduction,
    net_amount: net,
    affiliate: it?.affiliate?.name ?? null,
    coproducer: null,
    payment_method: p.payment?.type ?? null,
    status: String(p.status ?? 'UNKNOWN'),
    buyer: it?.buyer?.name ?? null,
    company_id: companyId,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'método não suportado' }, 405)

  try {
    const auth = req.headers.get('Authorization')
    // modo-serviço (cron diário): x-service-auth bate com a service key da
    // function → escreve sem usuário (bypassa RLS só neste caminho, gated pela
    // chave). verify_jwt está OFF no deploy pra o cron passar; por isso exigimos
    // aqui ou serviço autenticado, ou um Bearer de usuário (RLS protege a escrita).
    const serviceKey = Deno.env.get('HOTMART_SYNC_SERVICE_KEY')
    const isService = !!serviceKey && req.headers.get('x-service-auth') === serviceKey
    // não-serviço: exige um Bearer com cara de JWT (barra lixo antes de gastar
    // quota da Hotmart); a escrita real ainda é protegida pelo RLS de equipe
    if (!isService && !/^Bearer\s+eyJ/.test(auth ?? '')) return json({ error: 'sem autorização' }, 401)

    const { company_id, debug, months, start: startArg, end: endArg } = await req.json().catch(() => ({}))
    if (!company_id) return json({ error: 'company_id obrigatório' }, 400)

    const clientId = Deno.env.get('HOTMART_CLIENT_ID')
    const clientSecret = Deno.env.get('HOTMART_CLIENT_SECRET')
    if (!clientId || !clientSecret) return json({ error: 'secrets HOTMART_CLIENT_ID/SECRET não configurados' }, 500)

    // 1) token OAuth (Basic + client credentials)
    const basic = btoa(`${clientId}:${clientSecret}`)
    const tokenUrl = `${HOTMART_TOKEN_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`
    const tokenRes = await fetch(tokenUrl, { method: 'POST', headers: { Authorization: `Basic ${basic}` } })
    if (!tokenRes.ok) return json({ error: 'falha ao obter token Hotmart', status: tokenRes.status, body: await tokenRes.text() }, 502)
    const tokenJson = await tokenRes.json()
    const accessToken = tokenJson.access_token
    if (!accessToken) return json({ error: 'token Hotmart sem access_token', body: tokenJson }, 502)

    // 2) janela: explícita (start/end epoch ms, pra backfill em pedaços) ou
    //    móvel (default 2 meses — produto de alto volume)
    const end = Number(endArg) || Date.now()
    const janela = Math.max(1, Math.min(36, Number(months) || 2))
    const start = startArg ? Number(startArg) : end - janela * 30 * 24 * 60 * 60 * 1000

    // 3) paginação
    const items: any[] = []
    let pageToken = ''
    let paginas = 0
    do {
      const u = new URL(HOTMART_SALES_URL)
      u.searchParams.set('start_date', String(start))
      u.searchParams.set('end_date', String(end))
      u.searchParams.set('max_results', '100')
      if (pageToken) u.searchParams.set('page_token', pageToken)
      const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!r.ok) return json({ error: 'falha no histórico de vendas', status: r.status, body: await r.text() }, 502)
      const data = await r.json()

      // modo debug: devolve a 1ª venda crua E mapeada (sem gravar), pra validar
      if (debug) {
        const amostra = data?.items?.[0] ?? null
        return json({ debug: true, total_aprox: data?.page_info?.total_results ?? null, amostra, mapeada: amostra ? mapSale(amostra, company_id) : null, page_info: data?.page_info ?? null }, 200)
      }

      items.push(...((data?.items as any[]) ?? []))
      pageToken = data?.page_info?.next_page_token ?? ''
      paginas++
    } while (pageToken && paginas < 150)

    // 4) mapear + dedupe no lote (última ocorrência vence)
    const mapeadas = items.map((it) => mapSale(it, company_id)).filter(Boolean) as any[]
    const porCodigo = new Map(mapeadas.map((v) => [v.transaction_code, v]))
    const linhas = [...porCodigo.values()]

    if (linhas.length === 0) return json({ ok: true, encontradas: items.length, gravadas: 0, msg: 'Nenhuma venda no período.' })

    // 5) upsert em lotes de 500
    //  - serviço: escreve com a service key (bypassa RLS, gated por x-service-auth)
    //  - usuário: escreve com o JWT dele (respeita o RLS de equipe)
    const sb = isService
      ? createClient(Deno.env.get('SUPABASE_URL')!, serviceKey!)
      : createClient(Deno.env.get('SUPABASE_URL')!, PUBLISHABLE_KEY, { global: { headers: { Authorization: auth! } } })
    let gravadas = 0
    for (let i = 0; i < linhas.length; i += 500) {
      const lote = linhas.slice(i, i + 500)
      const { error, data } = await sb.from('hotmart_sales').upsert(lote, { onConflict: 'transaction_code' }).select('id')
      if (error) return json({ error: 'falha ao gravar', detalhe: error.message, gravadas_antes_do_erro: gravadas }, 500)
      gravadas += data?.length ?? 0
    }

    return json({ ok: true, encontradas: items.length, gravadas, paginas, janela_meses: janela })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
