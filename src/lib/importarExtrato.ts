import { supabase } from './supabase'
import { parseOfxExtrato } from './ofxExtrato'

// Import de extrato bancário pra bank_transactions com dedupe por
// UNIQUE(account_id, fit_id) e RELATÓRIO explícito (follow-up da Fase 1c: não
// engolir duplicatas em silêncio). FITID ausente → sintético determinístico:
//   `syn:data:valor:memo`  (+ `#n` quando o MESMO conteúdo repete no arquivo)
// Reimportar o mesmo arquivo gera os mesmos sintéticos → deduplica certo;
// dois lançamentos idênticos no mesmo arquivo recebem #1/#2 → ambos entram.
export interface ResultadoExtrato {
  total: number
  novas: number
  duplicadas: number
  semFitid: number
  msg: string
}

export async function importarExtratoOFX(
  file: File,
  accountId: string
): Promise<{ ok: ResultadoExtrato | null; erro: string | null }> {
  const texto = await file.text()
  const parsed = parseOfxExtrato(texto)
  if (parsed.length === 0) {
    return { ok: null, erro: 'Nenhuma transação encontrada no arquivo. Verifique se é um OFX válido.' }
  }

  const synCount = new Map<string, number>()
  let semFitid = 0
  const linhas = parsed.map((t) => {
    let fit = t.fitid
    if (!fit) {
      semFitid++
      const base = `syn:${t.data}:${t.valor.toFixed(2)}:${t.memo}`.slice(0, 240)
      const n = (synCount.get(base) ?? 0) + 1
      synCount.set(base, n)
      fit = n === 1 ? base : `${base}#${n}`
    }
    return {
      account_id: accountId,
      fit_id: fit,
      date: t.data,
      amount: t.valor,
      memo: t.memo || null,
      tx_type: t.tipo || null,
    }
  })

  const { error, data } = await supabase
    .from('bank_transactions')
    .upsert(linhas, { onConflict: 'account_id,fit_id', ignoreDuplicates: true })
    .select('id')
  if (error) return { ok: null, erro: 'Erro ao importar: ' + error.message }

  const novas = data?.length ?? 0
  const duplicadas = parsed.length - novas
  const partes = [`${parsed.length} no arquivo`, `${novas} nova${novas !== 1 ? 's' : ''}`]
  if (duplicadas > 0) partes.push(`${duplicadas} duplicada${duplicadas !== 1 ? 's' : ''} pulada${duplicadas !== 1 ? 's' : ''}`)
  if (semFitid > 0) partes.push(`${semFitid} sem FITID (id sintético gerado)`)

  return { ok: { total: parsed.length, novas, duplicadas, semFitid, msg: partes.join(' · ') }, erro: null }
}
