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
//  - POST {company_id, refresh_status:N}   → SÓ serviço: re-checa N vendas por
//    ?transaction=<id> e atualiza estornos (a busca por data não traz reembolso)
//  - POST {company_id, refresh_commissions:N} → SÓ serviço: preenche afiliado/
//    coprodução/líquido exato via /sales/commissions (o /sales/history não traz)
//  - header x-service-auth == HOTMART_SYNC_SERVICE_KEY → modo-serviço (cron
//    diário): escreve com a service key, sem usuário. verify_jwt=false no deploy.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const HOTMART_TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
const HOTMART_SALES_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'
const HOTMART_COMMISSIONS_URL = 'https://developers.hotmart.com/payments/api/v1/sales/commissions'

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

// Mapeia uma venda da API (/sales/history) pro shape de hotmart_sales.
// Verdade de campo confirmada contra 1600 vendas reais (2026-06-11):
//  - total pago pelo comprador: purchase.price.value (INCLUI juros de parcelamento)
//  - bruto (preço do produto, SEM juros): purchase.hotmart_fee.base (base da taxa)
//    ⚠️ purchase.price.base NÃO EXISTE — price só tem { currency_code, value }
//  - taxa Hotmart: purchase.hotmart_fee.total (~5% da base + fixo)
//  - líquido APROXIMADO: bruto - taxa (validado: base 297 → 281,15, bate com painel)
//  - afiliado/coprodução/líquido EXATO NÃO vêm do /sales/history — são donos do
//    modo refresh_commissions (via /sales/commissions). Por isso este map NÃO
//    emite affiliate*/coproduction*/coproducer (defaults 0/NULL os cobrem) pra o
//    sync diário não regravar por cima do que o refresh preencheu. Só net_amount
//    sai aqui (NOT NULL sem default), como aproximação que o refresh refina.
//  - status em inglês maiúsculo (COMPLETE/APPROVED/...): a allowlist pega
function mapSale(it: any, companyId: string) {
  const p = it?.purchase ?? {}
  const code = p.transaction ?? it?.transaction
  if (!code) return null
  const sale_date = isoDate(p.order_date ?? p.approved_date)
  if (!sale_date) return null

  const total = Number(p.price?.value ?? 0)                          // valor total pago (com juros de parcelamento)
  const gross = Number(p.hotmart_fee?.base ?? p.price?.value ?? 0)   // bruto: preço base do produto (sem juros)
  const fee = Number(p.hotmart_fee?.total ?? 0)
  const net = gross - fee                                            // líquido aproximado (refresh_commissions sobrescreve com o PRODUCER exato)

  return {
    transaction_code: String(code),
    product: it?.product?.name ?? 'Produto',
    sale_date,
    release_date: null, // sales/history não traz data de liberação/saque
    currency: p.price?.currency_code ?? 'BRL', // moeda da venda (USD existe)
    total_amount: total,
    gross_amount: gross,
    hotmart_fee: fee,
    fee_percentage: p.hotmart_fee?.percentage ?? null, // % cobrada pela Hotmart
    installments: p.payment?.installments_number ?? null, // nº de parcelas (1 = à vista)
    net_amount: net,
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

    const { company_id, debug, refresh_status, refresh_commissions, months, start: startArg, end: endArg } = await req.json().catch(() => ({}))
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

    // 1a-bis) modo refresh_commissions (SÓ serviço): preenche afiliado/coprodução
    //   e o líquido EXATO via /sales/commissions?transaction=<id> (que SEMPRE
    //   retorna, ao contrário da busca por data). Shape validado (2026-06-25):
    //   items[0].commissions[] = [{ source, commission:{value}, user:{name} }],
    //   source ∈ AFFILIATE/PRODUCER/COPRODUCER/ADDON/MARKETPLACE. Este modo é o
    //   DONO dessas colunas; grava authoritative (afiliado 0/NULL quando não há).
    //   Rodízio: prioriza commission_checked_at NULLS FIRST (backfill) E sempre
    //   re-checa a janela recente (~35d) que o sync diário regrava por cima.
    if (refresh_commissions) {
      if (!isService) return json({ error: 'refresh_commissions é só modo-serviço' }, 403)
      const N = Math.max(1, Math.min(500, Number(refresh_commissions) || 200))
      const sbsvc = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey!)
      const recente = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const { data: cands, error: eSel } = await sbsvc
        .from('hotmart_sales')
        .select('transaction_code')
        .eq('company_id', company_id)
        .or(`commission_checked_at.is.null,sale_date.gte.${recente}`)
        .order('commission_checked_at', { ascending: true, nullsFirst: true })
        .limit(N)
      if (eSel) return json({ error: 'falha ao selecionar candidatos', detalhe: eSel.message }, 500)
      const t0 = Date.now()
      const agora = new Date().toISOString()
      let verificados = 0
      let comAfiliado = 0
      for (const c of (cands ?? [])) {
        if (Date.now() - t0 > 100000) break // guarda de tempo
        const u = new URL(HOTMART_COMMISSIONS_URL)
        u.searchParams.set('transaction', c.transaction_code)
        const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
        if (!r.ok) continue
        const comms: any[] = (await r.json())?.items?.[0]?.commissions ?? []
        const val = (ok: (s: string) => boolean) =>
          comms.filter((x) => ok(String(x?.source ?? ''))).reduce((s, x) => s + Number(x?.commission?.value ?? 0), 0)
        const nome = (ok: (s: string) => boolean) =>
          comms.find((x) => ok(String(x?.source ?? '')))?.user?.name ?? null
        const isAff = (s: string) => /affiliate/i.test(s)
        const isCop = (s: string) => /co.?produc/i.test(s)
        const afi = val(isAff)
        const cop = val(isCop)
        const prod = comms.find((x) => /^producer$/i.test(String(x?.source ?? '')))
        const patch: Record<string, unknown> = {
          commission_checked_at: agora,
          affiliate_commission: afi,
          affiliate: afi > 0 ? nome(isAff) : null,
          coproduction_commission: cop,
          coproducer: cop > 0 ? nome(isCop) : null,
        }
        if (prod) patch.net_amount = Number(prod?.commission?.value ?? 0) // líquido exato
        if (afi > 0) comAfiliado++
        await sbsvc.from('hotmart_sales').update(patch).eq('transaction_code', c.transaction_code)
        verificados++
      }
      const restamNull = (cands?.length ?? 0) < N // heurística: lote menor que N ⇒ backfill perto do fim
      return json({ ok: true, refresh_commissions: true, candidatos: cands?.length ?? 0, verificados, com_afiliado: comAfiliado, backfill_perto_do_fim: restamNull })
    }

    // 1b) modo refresh_status (SÓ serviço): re-checa vendas existentes por
    //     ?transaction=<id> (sempre retorna, independente de status) pra capturar
    //     reembolso/chargeback que a busca por data omite. Rodízio por
    //     status_checked_at (NULLS FIRST). Patch NÃO-destrutivo: só status +
    //     status_checked_at. Guarda de tempo (~100s) pra não estourar.
    if (refresh_status) {
      if (!isService) return json({ error: 'refresh_status é só modo-serviço' }, 403)
      const N = Math.max(1, Math.min(500, Number(refresh_status) || 200))
      const sbsvc = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey!)
      const desde = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const { data: cands, error: eSel } = await sbsvc
        .from('hotmart_sales')
        .select('transaction_code, status')
        .eq('company_id', company_id)
        .gte('sale_date', desde)
        .in('status', ['COMPLETE', 'COMPLETED', 'APPROVED'])
        .order('status_checked_at', { ascending: true, nullsFirst: true })
        .limit(N)
      if (eSel) return json({ error: 'falha ao selecionar candidatos', detalhe: eSel.message }, 500)
      const t0 = Date.now()
      const agora = new Date().toISOString()
      let verificados = 0
      let mudaram = 0
      for (const c of (cands ?? [])) {
        if (Date.now() - t0 > 100000) break // guarda de tempo
        const u = new URL(HOTMART_SALES_URL)
        u.searchParams.set('transaction', c.transaction_code)
        const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
        if (!r.ok) continue
        const it = (await r.json())?.items?.[0]
        const novo = it?.purchase?.status ? String(it.purchase.status) : null
        const patch: Record<string, unknown> = { status_checked_at: agora }
        if (novo && novo !== c.status) { patch.status = novo; mudaram++ }
        await sbsvc.from('hotmart_sales').update(patch).eq('transaction_code', c.transaction_code)
        verificados++
      }
      return json({ ok: true, refresh: true, candidatos: cands?.length ?? 0, verificados, mudaram })
    }

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
