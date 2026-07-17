import type { ChartOfAccount, EntryType } from './types'

export interface ColunasImportacao {
  description?: number
  amount?: number
  due_date?: number
  issue_date?: number
  competency_date?: number
  counterparty?: number
  account?: number
  chart_of_account?: number
  notes?: number
  status?: number
  recurring?: number
  interest?: number
  fine?: number
  discount?: number
}

export function normalizarTexto(valor: string): string {
  return valor.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export function mapearColunasImportacao(headers: string[]): ColunasImportacao {
  const idx: ColunasImportacao = {}
  headers.forEach((header, i) => {
    const chave = normalizarTexto(header)
    if (['descricao', 'description', 'desc'].includes(chave)) idx.description = i
    if (['valor', 'amount', 'value'].includes(chave)) idx.amount = i
    if (['vencimento', 'due_date', 'venc'].includes(chave)) idx.due_date = i
    if (['emissao', 'issue_date', 'emis'].includes(chave)) idx.issue_date = i
    if (['competencia', 'competency_date', 'data de competencia', 'mes de referencia', 'referencia'].includes(chave)) idx.competency_date = i
    if (['fornecedor', 'cliente', 'counterparty', 'sacado'].includes(chave)) idx.counterparty = i
    if (['conta', 'account', 'conta bancaria'].includes(chave)) idx.account = i
    if (['conta contabil', 'conta do plano', 'plano de contas', 'chart_of_account', 'codigo conta contabil'].includes(chave)) idx.chart_of_account = i
    if (['observacoes', 'notes', 'obs'].includes(chave)) idx.notes = i
    if (chave === 'status') idx.status = i
    if (['recorrente', 'recurring'].includes(chave)) idx.recurring = i
    if (['juros', 'interest'].includes(chave)) idx.interest = i
    if (['multa', 'fine', 'penalty'].includes(chave)) idx.fine = i
    if (['desconto', 'discount'].includes(chave)) idx.discount = i
  })
  return idx
}

export function parseCsv(texto: string): string[][] {
  const linhas = texto.split(/\r?\n/).filter(Boolean)
  const separador = linhas[0]?.includes(';') ? ';' : ','
  return linhas.map((linha) => {
    const row: string[] = []
    let campo = ''
    let entreAspas = false
    for (let i = 0; i < linha.length; i++) {
      const caractere = linha[i]
      if (caractere === '"') entreAspas = !entreAspas
      else if (caractere === separador && !entreAspas) { row.push(campo.trim()); campo = '' }
      else campo += caractere
    }
    row.push(campo.trim())
    return row
  })
}

export function parseDataPlanilha(valor: string): string {
  const data = valor.trim()
  const br = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data
  return ''
}

export function parseValorPlanilha(valor: string): number {
  let numero = valor.replace(/[R$\s]/g, '')
  if (numero.includes('.') && numero.includes(',')) numero = numero.replace(/\./g, '').replace(',', '.')
  else if (numero.includes(',')) numero = numero.replace(',', '.')
  return parseFloat(numero) || 0
}

export function avancarUmMes(data: string, diaAncora?: number | null): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  if (!ano || !mes || !dia) return ''
  const alvo = new Date(ano, mes, 1)
  const anoAlvo = alvo.getFullYear()
  const mesAlvo = alvo.getMonth() + 1
  const ultimoDia = new Date(anoAlvo, mesAlvo, 0).getDate()
  const diaAlvo = Math.min(diaAncora ?? dia, ultimoDia)
  return `${anoAlvo}-${String(mesAlvo).padStart(2, '0')}-${String(diaAlvo).padStart(2, '0')}`
}

export function contaDisponivelParaEmpresa(conta: ChartOfAccount, companyId: string): boolean {
  return conta.company_id === null || conta.company_id === companyId
}

export function contaCompativelComLancamento(conta: ChartOfAccount, tipo: EntryType): boolean {
  if (conta.tipo === 'patrimonial') return true
  if (conta.nature === 'deduction') return true
  if (tipo === 'receivable') return conta.nature === 'revenue'
  return ['variable_cost', 'fixed_cost', 'financial', 'depreciation', 'tax'].includes(conta.nature)
}

export function contaCompativelComCartao(conta: ChartOfAccount): boolean {
  if (conta.tipo === 'patrimonial') return true
  return ['variable_cost', 'fixed_cost', 'financial', 'depreciation', 'tax'].includes(conta.nature)
}

export function rotuloContaContabil(conta: ChartOfAccount): string {
  const sufixo = conta.tipo === 'patrimonial' ? ' · Patrimonial' : ''
  return `${conta.code} – ${conta.name}${sufixo}`
}

export function tributoSobreVendaMencionado(descricao: string): string | null {
  const texto = normalizarTexto(descricao)
  if (/\bpis\b/.test(texto)) return 'PIS'
  if (/\bcofins\b/.test(texto)) return 'COFINS'
  if (/\bicms\b/.test(texto)) return 'ICMS'
  if (/\biss(?:qn)?\b/.test(texto)) return 'ISS'
  return null
}
