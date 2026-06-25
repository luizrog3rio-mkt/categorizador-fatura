// ─── Mundo "fatura de cartão" — parser OFX + utilitários ─────────────────────
// Datas como texto DD/MM/YYYY; unescape de &amp;. amount segue positivo
// (magnitude); o sinal contábil vem do kind — ver valorComSinal().
// DESVIO CONSCIENTE do contrato #3 (2026-06-22, decisão do Luiz): o parser não
// descarta mais TODO crédito. Estornos/descontos (TRNTYPE=CREDIT) entram com
// kind='credit' e ABATEM o total; só o pagamento da fatura ANTERIOR
// (memo /PAGAMENTO|BOLETO/) é descartado.
// A categorização (categorias + auto-regras) foi removida em 2026-06-25.

// ─── Parser OFX de FATURA DE CARTÃO ─────────────────────────────────────────
// Sicoob: despesa = TRNTYPE=PAYMENT (valor negativo); crédito = TRNTYPE=CREDIT
// (valor positivo: estorno/desconto/pagamento da fatura). Guardamos amount como
// magnitude (Math.abs) + kind; o pagamento da fatura ANTERIOR é descartado.
// data como texto DD/MM/YYYY, unescape de &amp;. NÃO usar pra extrato corrente.
export interface TxImportada {
  fit_id: string
  memo: string
  amount: number // sempre positivo (magnitude); o sinal vem de kind
  date: string
  kind: 'debit' | 'credit' // débito = despesa; crédito = estorno/desconto (abate)
}

export function parseOFXCartao(text: string): TxImportada[] {
  const transactions: TxImportada[] = []
  const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g
  let m: RegExpExecArray | null
  while ((m = stmtRegex.exec(text)) !== null) {
    const block = m[1]
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}>([^<]*)`)
      const x = r.exec(block)
      return x ? x[1].trim() : ''
    }
    const tipo = get('TRNTYPE')
    const memo = get('MEMO').replace(/&amp;/g, '&')
    const amtRaw = parseFloat(get('TRNAMT').replace(',', '.'))
    const dateRaw = get('DTPOSTED')
    const date = dateRaw ? `${dateRaw.slice(6, 8)}/${dateRaw.slice(4, 6)}/${dateRaw.slice(0, 4)}` : ''
    if (!memo || isNaN(amtRaw)) continue
    // pagamento da fatura ANTERIOR não entra nesta fatura (se anula com a
    // linha "FATURA ANTERIOR" do resumo) — descartado por memo
    if (tipo === 'CREDIT' && /PAGAMENTO|BOLETO/i.test(memo)) continue
    const kind: 'debit' | 'credit' = tipo === 'CREDIT' ? 'credit' : 'debit'
    transactions.push({
      fit_id: get('FITID'),
      memo,
      amount: Math.abs(amtRaw),
      date,
      kind,
    })
  }
  return transactions
}

// Valor com o sinal contábil: despesa soma (+), crédito/estorno abate (−).
// Fonte única do sinal pra todo o "mundo fatura" (total, dashboard, export).
export function valorComSinal(t: { amount: number; kind: 'debit' | 'credit' }): number {
  return t.kind === 'credit' ? -t.amount : t.amount
}

export function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonth(ym: string | null): string {
  if (!ym) return 'Sem mês'
  const [y, m] = ym.split('-')
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${names[Number(m) - 1]}/${y}`
}
