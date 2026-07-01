import { supabase } from './supabase'
import { parseOFXCartao, valorComSinal } from './fatura'
import type { Invoice, PurchaseItem } from './types'

// Fluxo de import de fatura de cartão — port do handleFile do App.jsx, com
// duas evoluções conscientes: grava invoices.account_id (Fase 1c) e CHECA
// erros (o app antigo engolia). Sem dedupe de reimport (contrato #14:
// comportamento preservado — reimportar cria fatura duplicada).
export interface ResultadoImport {
  invoice: Invoice
  pendentes: PurchaseItem[]
}

export async function importarFaturaOFX(
  file: File,
  userId: string,
  accountId: string | null
): Promise<{ ok: ResultadoImport | null; erro: string | null }> {
  const text = await file.text()
  const txs = parseOFXCartao(text)
  // OFX vazio/malformado: NÃO criar fatura-fantasma (total 0) em silêncio — erro explícito,
  // espelhando o guard do importarExtratoOFX. (O parser de cartão é case-sensitive e exige
  // </STMTTRN>, então um formato inesperado retorna [] — daí o aviso.)
  if (txs.length === 0) {
    return { ok: null, erro: 'Nenhum lançamento encontrado no arquivo. Verifique se é um OFX de fatura de cartão válido.' }
  }
  // total contábil: despesa soma, estorno/desconto abate (ver valorComSinal). Arredonda pra 2 casas
  // — a soma de floats em JS gera dust (ex.: 140585.03999999992); sem isso o dust ia pro banco.
  const total = Math.round(txs.reduce((s, t) => s + valorComSinal(t), 0) * 100) / 100

  const { data: inv, error: e1 } = await supabase
    .from('invoices')
    .insert({
      user_id: userId,
      name: file.name.replace(/\.ofx$/i, ''),
      total,
      transaction_count: txs.length,
      account_id: accountId,
    })
    .select()
    .single()
  if (e1 || !inv) return { ok: null, erro: 'Erro ao criar a fatura: ' + (e1?.message ?? 'sem retorno') }

  // Guarda o .ofx original no Storage (best-effort): o dado estruturado já está
  // salvo, então uma falha aqui NÃO perde a fatura — só a deixa sem o arquivo
  // pra baixar depois. Caminho escopado pelo id da fatura (reimport = id novo,
  // sem colisão; contrato #14).
  const ofxPath = `${inv.id}/${file.name}`
  const { error: eUp } = await supabase.storage
    .from('faturas-ofx')
    .upload(ofxPath, file, { upsert: false })
  if (eUp) {
    console.warn('OFX não foi salvo no Storage (fatura criada mesmo assim):', eUp.message)
  } else {
    const { error: eP } = await supabase.from('invoices').update({ ofx_path: ofxPath }).eq('id', inv.id)
    if (eP) console.warn('OFX salvo, mas ofx_path não gravou:', eP.message)
    else inv.ofx_path = ofxPath
  }

  if (txs.length > 0) {
    const rows = txs.map((t) => ({
      user_id: userId,
      invoice_id: inv.id,
      fit_id: t.fit_id,
      memo: t.memo,
      amount: t.amount,
      date: t.date,
      kind: t.kind,
    }))
    const { error: e2 } = await supabase.from('transactions').insert(rows)
    if (e2) return { ok: null, erro: 'Fatura criada, mas falhou ao inserir lançamentos: ' + e2.message }
  }

  // pendentes pra oferecer no modal (contrato #7)
  const { data: pendentes } = await supabase
    .from('purchase_items')
    .select('*')
    .is('invoice_id', null)
    .order('month', { ascending: false })
    .order('created_at')

  return { ok: { invoice: inv, pendentes: pendentes ?? [] }, erro: null }
}
