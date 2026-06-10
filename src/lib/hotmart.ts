// Parser do CSV de vendas exportado da Hotmart — port do hotmart.ts do rb7.
// Lógica de parsing preservada VERBATIM (parseValor BR/US corrigido na
// auditoria, vendaAprovada com allowlist, detecção de coluna por palavra-chave
// PT/EN). Única mudança: a saída usa os nomes de coluna EN da tabela
// hotmart_sales (transaction_code, product, sale_date, ...).

export interface HotmartSaleImport {
  transaction_code: string
  product: string
  sale_date: string
  release_date: string | null
  gross_amount: number
  hotmart_fee: number
  affiliate_commission: number
  coproduction_commission: number
  net_amount: number
  affiliate: string | null
  coproducer: string | null
  payment_method: string | null
  status: string
  buyer: string | null
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let dentroAspas = false
  const sep = detectarSeparador(text)
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (dentroAspas) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') dentroAspas = false
      else cur += c
    } else if (c === '"') dentroAspas = true
    else if (c === sep) { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function detectarSeparador(text: string): string {
  const linha = text.split('\n')[0] ?? ''
  return (linha.match(/;/g)?.length ?? 0) > (linha.match(/,/g)?.length ?? 0) ? ';' : ','
}

function idxPor(headers: string[], ...palavras: string[]): number {
  return headers.findIndex((h) => {
    const hl = h.toLowerCase()
    return palavras.every((p) => hl.includes(p.toLowerCase()))
  })
}

function parseValor(raw: string | undefined): number {
  if (!raw) return 0
  let s = raw.replace(/[^\d.,-]/g, '')
  // formato BR: 1.234,56
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  // milhar BR sem decimais: 1.234 / 12.345.678 (dinheiro nunca tem 3 casas)
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  else s = s.replace(/,/g, '')
  const v = parseFloat(s)
  return isNaN(v) ? 0 : v
}

function parseData(raw: string | undefined): string | null {
  if (!raw) return null
  const t = raw.trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(t)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// Allowlist: só conta como receita o que foi de fato aprovado/concluído.
// (Denylist deixava passar WAITING_PAYMENT, BILLET_PRINTED, EXPIRED etc.)
export function vendaAprovada(status: string): boolean {
  return /aprovad|complet|conclu|approved/i.test(status)
}

export function parseHotmartCSV(text: string): { vendas: HotmartSaleImport[]; erros: string[] } {
  const rows = parseCSV(text)
  const erros: string[] = []
  if (rows.length < 2) return { vendas: [], erros: ['Arquivo vazio ou sem linhas de dados.'] }

  const h = rows[0]
  const iCodigo = idxPor(h, 'transa') // transação / transaction
  const iProduto = idxPor(h, 'produto') >= 0 ? idxPor(h, 'produto') : idxPor(h, 'product')
  const iData = idxPor(h, 'data') >= 0 ? idxPor(h, 'data') : idxPor(h, 'date')
  const iBruto = idxPor(h, 'bruto') >= 0 ? idxPor(h, 'bruto') : idxPor(h, 'gross')
  const iTaxa = idxPor(h, 'taxa')
  const iAfiliadoVal = idxPor(h, 'comiss', 'afili')
  const iCoprodVal = idxPor(h, 'comiss', 'coprod')
  const iLiquido = idxPor(h, 'líquido') >= 0 ? idxPor(h, 'líquido') : idxPor(h, 'liquido') >= 0 ? idxPor(h, 'liquido') : idxPor(h, 'net')
  const iAfiliado = idxPor(h, 'afiliado') >= 0 ? idxPor(h, 'afiliado') : idxPor(h, 'affiliate')
  const iCoprod = idxPor(h, 'coprodutor')
  const iMeio = idxPor(h, 'pagamento') >= 0 ? idxPor(h, 'pagamento') : idxPor(h, 'payment')
  const iStatus = idxPor(h, 'status')
  const iComprador = idxPor(h, 'comprador') >= 0 ? idxPor(h, 'comprador') : idxPor(h, 'buyer')
  const iLiberacao = idxPor(h, 'libera')

  if (iCodigo < 0) erros.push('Coluna de código da transação não encontrada.')
  if (iData < 0) erros.push('Coluna de data não encontrada.')
  if (erros.length) return { vendas: [], erros }

  const vendas: HotmartSaleImport[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const codigo = row[iCodigo]?.trim()
    const data = parseData(row[iData])
    if (!codigo || !data) { erros.push(`Linha ${r + 1}: código ou data inválidos — ignorada.`); continue }
    const bruto = parseValor(row[iBruto])
    const taxa = iTaxa >= 0 ? parseValor(row[iTaxa]) : 0
    const comAf = iAfiliadoVal >= 0 ? parseValor(row[iAfiliadoVal]) : 0
    const comCo = iCoprodVal >= 0 ? parseValor(row[iCoprodVal]) : 0
    const liquido = iLiquido >= 0 ? parseValor(row[iLiquido]) : bruto - taxa - comAf - comCo
    vendas.push({
      transaction_code: codigo,
      product: iProduto >= 0 ? row[iProduto]?.trim() || 'Produto' : 'Produto',
      sale_date: data,
      release_date: iLiberacao >= 0 ? parseData(row[iLiberacao]) : null,
      gross_amount: bruto,
      hotmart_fee: taxa,
      affiliate_commission: comAf,
      coproduction_commission: comCo,
      net_amount: liquido,
      affiliate: iAfiliado >= 0 ? row[iAfiliado]?.trim() || null : null,
      coproducer: iCoprod >= 0 ? row[iCoprod]?.trim() || null : null,
      payment_method: iMeio >= 0 ? row[iMeio]?.trim() || null : null,
      status: iStatus >= 0 ? row[iStatus]?.trim() || 'aprovada' : 'aprovada',
      buyer: iComprador >= 0 ? row[iComprador]?.trim() || null : null,
    })
  }
  return { vendas, erros }
}
