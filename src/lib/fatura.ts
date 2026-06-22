// ─── Mundo "fatura de cartão" — port fiel do App.jsx original ────────────────
// Contratos preservados: docs/fase2/contratos-app-antigo.md
// (datas texto DD/MM/YYYY; auto-categorização por substring case-insensitive,
//  primeira regra vence; TAG_COLORS por color_index; defaults de seed idênticos.)
// DESVIO CONSCIENTE do contrato #3 (2026-06-22, decisão do Luiz): o parser não
// descarta mais TODO crédito. Estornos/descontos (TRNTYPE=CREDIT) entram com
// kind='credit' e ABATEM o total; só o pagamento da fatura ANTERIOR
// (memo /PAGAMENTO|BOLETO/) é descartado. amount segue positivo (magnitude);
// o sinal vem do kind — ver valorComSinal().

export interface TagColor {
  bg: string
  text: string
  border: string
}

export const TAG_COLORS: TagColor[] = [
  { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe' },
  { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' },
  { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
  { bg: '#ecfdf5', text: '#065f46', border: '#6ee7b7' },
  { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' },
]

export const CAT_CHART_COLORS = [
  '#534AB7', '#D4537E', '#D85A30', '#1D9E75', '#378ADD',
  '#BA7517', '#3B6D11', '#E24B4A', '#888780', '#075985',
]

// Categoria como a UI usa (tabela viva `categories`/`purchase_item_categories`
// + cor resolvida pela paleta)
export interface CatUI {
  id: string
  name: string
  color: TagColor
  colorIndex: number
}

export const corDaCategoria = (colorIndex: number): TagColor =>
  TAG_COLORS[colorIndex % TAG_COLORS.length]

export const DEFAULT_CATEGORIES = [
  { name: 'Compras Online', colorIndex: 2 },
  { name: 'Educação', colorIndex: 3 },
  { name: 'Ferramenta', colorIndex: 4 },
  { name: 'Imposto', colorIndex: 9 },
  { name: 'Operacional', colorIndex: 6 },
  { name: 'PF - Rafa', colorIndex: 1 },
  { name: 'Taxa', colorIndex: 7 },
  { name: 'Tráfego Pago', colorIndex: 5 },
  { name: 'Viagem', colorIndex: 0 },
]

export const DEFAULT_PURCHASE_CATEGORIES = [
  { name: 'Estrutura', colorIndex: 2 },
  { name: 'Operacional', colorIndex: 6 },
  { name: 'Material de escritório', colorIndex: 4 },
  { name: 'Viagem', colorIndex: 0 },
  { name: 'Educação', colorIndex: 3 },
]

export interface RegraUI {
  keywords: string[]
  category: string
}

export const DEFAULT_RULES: RegraUI[] = [
  { keywords: ['mercadolivre', 'mercado livre', 'mp*mercadoliv'], category: 'Compras Online' },
  { keywords: ['hotmart', 'htm '], category: 'Educação' },
  { keywords: ['adobe'], category: 'Ferramenta' },
  { keywords: ['airtable'], category: 'Ferramenta' },
  { keywords: ['anthropic', 'claude.ai'], category: 'Ferramenta' },
  { keywords: ['apify'], category: 'Ferramenta' },
  { keywords: ['asa*utmify', 'utmify'], category: 'Ferramenta' },
  { keywords: ['autentique'], category: 'Ferramenta' },
  { keywords: ['clinthub'], category: 'Ferramenta' },
  { keywords: ['digitalocean'], category: 'Ferramenta' },
  { keywords: ['dl*google'], category: 'Ferramenta' },
  { keywords: ['hostinger', 'dm *hostinger'], category: 'Ferramenta' },
  { keywords: ['canva'], category: 'Ferramenta' },
  { keywords: ['captions.ai'], category: 'Ferramenta' },
  { keywords: ['elevenlabs'], category: 'Ferramenta' },
  { keywords: ['framer.com'], category: 'Ferramenta' },
  { keywords: ['ig*salvy', 'ig*turbocloud', 'pg *turbo cloud', 'turbocloud'], category: 'Ferramenta' },
  { keywords: ['inlead'], category: 'Ferramenta' },
  { keywords: ['instrack'], category: 'Ferramenta' },
  { keywords: ['lovable'], category: 'Ferramenta' },
  { keywords: ['manychat'], category: 'Ferramenta' },
  { keywords: ['openai', 'chatgpt'], category: 'Ferramenta' },
  { keywords: ['paddle.net'], category: 'Ferramenta' },
  { keywords: ['pg *unnichat'], category: 'Ferramenta' },
  { keywords: ['pg *yoshiura'], category: 'Ferramenta' },
  { keywords: ['railway'], category: 'Ferramenta' },
  { keywords: ['rapidapi'], category: 'Ferramenta' },
  { keywords: ['scrapingdog'], category: 'Ferramenta' },
  { keywords: ['sendpulse'], category: 'Ferramenta' },
  { keywords: ['short.io'], category: 'Ferramenta' },
  { keywords: ['soniox'], category: 'Ferramenta' },
  { keywords: ['stape'], category: 'Ferramenta' },
  { keywords: ['streamyard'], category: 'Ferramenta' },
  { keywords: ['supabase'], category: 'Ferramenta' },
  { keywords: ['uazapi'], category: 'Ferramenta' },
  { keywords: ['vidiq'], category: 'Ferramenta' },
  { keywords: ['visitorapi'], category: 'Ferramenta' },
  { keywords: ['vturb'], category: 'Ferramenta' },
  { keywords: ['yay! forms', 'yayforms'], category: 'Ferramenta' },
  { keywords: ['zoom.com', 'zoom.us'], category: 'Ferramenta' },
  { keywords: ['iof operacao', 'iof operação'], category: 'Imposto' },
  { keywords: ['claro negoci'], category: 'Operacional' },
  { keywords: ['starlink'], category: 'Operacional' },
  { keywords: ['pg *br did telefonia', 'br did'], category: 'Operacional' },
  { keywords: ['recvivo'], category: 'Operacional' },
  { keywords: ['zurich seguro'], category: 'Operacional' },
  { keywords: ['guaritao'], category: 'PF - Rafa' },
  { keywords: ['prudent*apol'], category: 'PF - Rafa' },
  { keywords: ['anuidade visa', 'anuidade mastercard', 'anuidade'], category: 'Taxa' },
  { keywords: ['protecao perda', 'proteção perda'], category: 'Taxa' },
  { keywords: ['facebk '], category: 'Tráfego Pago' },
  { keywords: ['americam plaza', 'american p a h'], category: 'Viagem' },
  { keywords: ['auto posto sofia'], category: 'Viagem' },
  { keywords: ['elias do coco'], category: 'Viagem' },
  { keywords: ['estac. sicoob', 'pedgio sicoob'], category: 'Viagem' },
  { keywords: ['estanplaza'], category: 'Viagem' },
  { keywords: ['mp*voeeconomy', 'voeeconomy'], category: 'Viagem' },
  { keywords: ['radisson'], category: 'Viagem' },
  { keywords: ['rest frangoassado', 'rest. - cambui', 'restaurante do marqu', 'trembao restaurante'], category: 'Viagem' },
  { keywords: ['rodoposto', 'rodosnack'], category: 'Viagem' },
  { keywords: ['tivoli ecoresort'], category: 'Viagem' },
  { keywords: ['scp estacionamento'], category: 'Viagem' },
]

// ─── Auto-categorização (contrato #4: substring case-insensitive, 1ª vence) ──
export function autoCategorizeMemo(memo: string, rules: RegraUI[]): string | null {
  const lower = memo.toLowerCase()
  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))) return rule.category
  }
  return null
}

// ─── Parser OFX de FATURA DE CARTÃO ─────────────────────────────────────────
// Sicoob: despesa = TRNTYPE=PAYMENT (valor negativo); crédito = TRNTYPE=CREDIT
// (valor positivo: estorno/desconto/pagamento da fatura). Guardamos amount como
// magnitude (Math.abs) + kind; o pagamento da fatura ANTERIOR é descartado.
// data como texto DD/MM/YYYY, unescape de &amp;. NÃO usar pra extrato corrente
// (esse é o parser genérico que entra na Etapa 5).
export interface TxImportada {
  fit_id: string
  memo: string
  amount: number // sempre positivo (magnitude); o sinal vem de kind
  date: string
  category: string | null
  auto: boolean
  kind: 'debit' | 'credit' // débito = despesa; crédito = estorno/desconto (abate)
}

export function parseOFXCartao(text: string, rules: RegraUI[]): TxImportada[] {
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
    const autoCategory = autoCategorizeMemo(memo, rules)
    transactions.push({
      fit_id: get('FITID'),
      memo,
      amount: Math.abs(amtRaw),
      date,
      category: autoCategory,
      auto: !!autoCategory,
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
