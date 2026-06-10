// Parser OFX de EXTRATO bancário (conta corrente) — port do ofx.ts do rb7.
// Difere do parser de FATURA DE CARTÃO (lib/fatura.ts): preserva o SINAL do
// valor (débito negativo, crédito positivo), data como YYYY-MM-DD, fallback
// MEMO||NAME. Aqui o dedupe UNIQUE(account_id, fit_id) é CORRETO (extrato não
// tem o problema do FITID repetido do Sicoob).
//
// Diferença consciente vs o rb7: NÃO descarta transações sem FITID — o
// import gera um FITID sintético (a tabela exige fit_id NOT NULL). Ver
// lib/importarExtrato.ts.
export interface OfxTx {
  fitid: string // '' quando o banco não forneceu
  data: string // YYYY-MM-DD
  valor: number // COM sinal
  memo: string
  tipo: string
}

function extrairTag(bloco: string, tag: string): string {
  // OFX SGML: <TAG>valor (sem fechamento) | XML: <TAG>valor</TAG>
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')
  const m = bloco.match(re)
  return m ? m[1].trim() : ''
}

function parseDataOfx(raw: string): string {
  // formato: YYYYMMDDHHMMSS[.XXX][TZ]
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return ''
  return `${m[1]}-${m[2]}-${m[3]}`
}

export function parseOfxExtrato(conteudo: string): OfxTx[] {
  const transacoes: OfxTx[] = []
  const blocos = conteudo.split(/<STMTTRN>/i).slice(1)
  for (const b of blocos) {
    const bloco = b.split(/<\/STMTTRN>/i)[0]
    const fitid = extrairTag(bloco, 'FITID')
    const data = parseDataOfx(extrairTag(bloco, 'DTPOSTED'))
    const valor = parseFloat(extrairTag(bloco, 'TRNAMT').replace(',', '.'))
    const memo = (extrairTag(bloco, 'MEMO') || extrairTag(bloco, 'NAME')).replace(/&amp;/g, '&')
    const tipo = extrairTag(bloco, 'TRNTYPE')
    // exige só data + valor (fitid é opcional — sintetizado no import)
    if (data && !isNaN(valor)) {
      transacoes.push({ fitid, data, valor, memo, tipo })
    }
  }
  return transacoes
}
