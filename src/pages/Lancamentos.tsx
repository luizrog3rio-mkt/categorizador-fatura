import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Plus, Pencil, CheckCircle2, Trash2, ArrowRight, ArrowLeftRight, Repeat, Upload, Search, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, fmtData, hoje } from '../lib/format'
import type { Account, Entry, EntryType, EntryStatus } from '../lib/types'
import type { ChartOfAccount, DreProduct } from '../lib/types'
import { Card, PageHeader, StatusBadge, Badge, Vazio, Modal, ErroBanner, Alert, KPICard, KPIStrip, inputCls, btnPrimario, btnSecundario } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'
import { exportTabelaCSV, exportTabelaXLSX } from '../lib/exportTabela'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import type { RowSelectionState } from '@tanstack/react-table'
import DateRangePicker from '../components/DateRangePicker'

// Etapa 4 — Contas a Pagar/Receber. Port do Lancamentos.tsx do rb7 adaptado
// pro schema EN (tabela `entries`). Adaptações vs a fonte:
//  - `lancamentos`→`entries` e todas as colunas PT→EN; enums EN.
//  - classificação por Conta DRE (chart_of_accounts) + Produto (dre_products);
//    a categoria legada foi removida (2026-06-25).
//  - embed de accounts precisa do hint !account_id (entries tem 2 FKs pra
//    accounts: account_id e invoice_account_id → PGRST201 sem o hint).
//  - erros aparecem em banner (o rb7 também engolia).

interface FormState {
  id?: string
  company_id: string
  account_id: string
  description: string
  amount: string
  interest: string
  fine: string
  discount: string
  competency_date: string
  chart_of_account_id: string
  dre_product_id: string
  refund_of_entry_id: string
  installments: number
  issue_date: string
  due_date: string
  payment_date: string
  status: EntryStatus
  statusOriginal?: EntryStatus // status antes da edição (p/ detectar a transição p/ "pago")
  counterparty: string
  notes: string
  is_recurring: boolean
  recurrence_day?: number | null // dia-âncora da série (carregado na edição)
  dueOriginal?: string // vencimento antes da edição (p/ decidir se re-ancora a série)
}

const formVazio = (companyId: string): FormState => ({
  company_id: companyId,
  account_id: '',
  description: '',
  amount: '',
  interest: '',
  fine: '',
  discount: '',
  competency_date: hoje(),
  chart_of_account_id: '',
  dre_product_id: '',
  refund_of_entry_id: '',
  installments: 1,
  issue_date: hoje(),
  due_date: hoje(),
  payment_date: '',
  status: 'to_pay',
  counterparty: '',
  notes: '',
  is_recurring: false,
})

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function mapColunas(headers: string[]) {
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => {
    const k = normalizar(h)
    if (['descricao', 'description', 'desc'].includes(k)) idx.description = i
    if (['valor', 'amount', 'value'].includes(k)) idx.amount = i
    if (['vencimento', 'due_date', 'venc'].includes(k)) idx.due_date = i
    if (['emissao', 'issue_date', 'emis'].includes(k)) idx.issue_date = i
    if (['fornecedor', 'cliente', 'counterparty', 'sacado'].includes(k)) idx.counterparty = i
    if (['conta', 'account'].includes(k)) idx.account = i
    if (['observacoes', 'notes', 'obs'].includes(k)) idx.notes = i
    if (['status'].includes(k)) idx.status = i
    if (['recorrente', 'recurring'].includes(k)) idx.recurring = i
    if (['juros', 'interest'].includes(k)) idx.interest = i
    if (['multa', 'fine', 'penalty'].includes(k)) idx.fine = i
    if (['desconto', 'discount'].includes(k)) idx.discount = i
  })
  return idx
}

function parseCsv(text: string): string[][] {
  const linhas = text.split(/\r?\n/).filter(Boolean)
  // separador: ';' tem precedência (padrão de planilha BR/Excel pt-BR, em que a
  // vírgula é o decimal — ex.: 2500,00); cai para ',' nos CSVs internacionais.
  const sep = linhas[0]?.includes(';') ? ';' : ','
  return linhas.map((line) => {
    const row: string[] = []
    let field = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === sep && !inQuotes) { row.push(field.trim()); field = '' }
      else { field += ch }
    }
    row.push(field.trim())
    return row
  })
}

function parseData(val: string): string {
  const v = val.trim()
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return ''
}

function parseValor(val: string): number {
  let v = val.replace(/[R$\s]/g, '')
  if (v.includes('.') && v.includes(',')) {
    // 1.234,56 — BR: ponto = milhar, vírgula = decimal
    v = v.replace(/\./g, '').replace(',', '.')
  } else if (v.includes(',')) {
    // 1234,56 — vírgula como decimal (BR)
    v = v.replace(',', '.')
  }
  return parseFloat(v) || 0
}

// parse de campo do form (vírgula ou ponto decimal); vazio = 0
const num = (s: string) => parseFloat((s ?? '').replace(',', '.')) || 0

// valor efetivamente pago/recebido (amount + juros + multa − desconto). Os encargos
// só são preenchidos no pagamento, então até lá isto é igual ao amount.
const valorPago = (l: Entry) =>
  Number(l.amount) + Number(l.interest_amount) + Number(l.fine_amount) - Number(l.discount_amount)

const STATUS_MAP: Record<string, EntryStatus> = {
  'a pagar': 'to_pay', 'a receber': 'to_pay', 'to_pay': 'to_pay',
  'pendente': 'pending', 'pending': 'pending',
  'pago': 'paid', 'recebido': 'paid', 'paid': 'paid',
  'cancelado': 'cancelled', 'cancelled': 'cancelled',
}

export default function Lancamentos({ tipo }: { tipo: EntryType }) {
  const { empresas, empresaAtiva, session, isAdmin } = useApp()
  const toast = useToast()
  const confirmar = useConfirm()
  const [lancamentos, setLancamentos] = useState<Entry[]>([])
  const [contas, setContas] = useState<Account[]>([])
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState<FormState>(formVazio(''))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccount[]>([])
  const [dreProducts, setDreProducts] = useState<DreProduct[]>([])
  const [closedPeriods, setClosedPeriods] = useState<string[]>([])

  // import
  const [importAberto, setImportAberto] = useState(false)
  const [importLinhas, setImportLinhas] = useState<string[][]>([])
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importErro, setImportErro] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // transferência entre contas
  const [transferAberto, setTransferAberto] = useState(false)
  const [transferForm, setTransferForm] = useState({ origem: '', destino: '', amount: '', date: hoje(), description: '' })
  const [transferindo, setTransferindo] = useState(false)

  const carregar = useCallback(async () => {
    setErro(null)
    let q = supabase
      .from('entries')
      .select('*, account:accounts!account_id(*), chart_of_account:chart_of_accounts(*), dre_product:dre_products(*)')
      .eq('type', tipo)
      .order('due_date')
    // empresa: filtro local da tela tem precedência sobre o escopo global
    const escopoEmpresa = filtroEmpresa || empresaAtiva?.id
    if (escopoEmpresa) q = q.eq('company_id', escopoEmpresa)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    if (dataDe) q = q.gte('due_date', dataDe)
    if (dataAte) q = q.lte('due_date', dataAte)
    const { data, error } = await q
    if (error) setErro('Erro ao carregar lançamentos: ' + error.message)
    else setLancamentos((data as Entry[]) ?? [])
    setCarregando(false)
  }, [tipo, empresaAtiva, filtroStatus, filtroEmpresa, dataDe, dataAte])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    supabase.from('accounts').select('*').eq('active', true).order('name').then(({ data }) => setContas(data ?? []))
    supabase.from('chart_of_accounts').select('*').eq('active', true).eq('is_analytical', true).order('sort_order').then(({ data }) => setChartAccounts(data ?? []))
    supabase.from('dre_products').select('*').eq('active', true).order('sort_order').then(({ data }) => setDreProducts(data ?? []))
    supabase.from('closed_periods').select('period').then(({ data }) => setClosedPeriods((data ?? []).map(d => d.period)))
  }, [])

  const abrirNovo = () => {
    setForm(formVazio(empresaAtiva?.id ?? empresas[0]?.id ?? ''))
    setModalAberto(true)
  }

  const abrirEdicao = useCallback((l: Entry) => {
    setForm({
      id: l.id,
      company_id: l.company_id,
      account_id: l.account_id ?? '',
      description: l.description,
      amount: String(l.amount),
      interest: l.interest_amount ? String(l.interest_amount) : '',
      fine: l.fine_amount ? String(l.fine_amount) : '',
      discount: l.discount_amount ? String(l.discount_amount) : '',
      competency_date: l.competency_date ?? '',
      chart_of_account_id: l.chart_of_account_id ?? '',
      dre_product_id: l.dre_product_id ?? '',
      refund_of_entry_id: l.refund_of_entry_id ?? '',
      installments: 1,
      issue_date: l.issue_date ?? '',
      due_date: l.due_date,
      payment_date: l.payment_date ?? '',
      status: (l.status as EntryStatus) ?? 'to_pay',
      statusOriginal: (l.status as EntryStatus) ?? 'to_pay',
      counterparty: l.counterparty ?? '',
      notes: l.notes ?? '',
      is_recurring: l.is_recurring ?? false,
      recurrence_day: l.recurrence_day ?? null,
      dueOriginal: l.due_date,
    })
    setModalAberto(true)
  }, [])

  // gera o lançamento do mês seguinte de uma série recorrente (mesmo valor,
  // conta; vencimento +1 mês; status inicial "a pagar")
  const inserirProximoMes = useCallback(async (b: {
    company_id: string; account_id: string | null
    type: EntryType; description: string; amount: number; due_date: string
    counterparty: string | null; notes: string | null; recurrence_day: number | null
  }) => {
    // avança 1 mês mantendo o DIA-ÂNCORA da série (recurrence_day): só faz clamp
    // no mês que não tem o dia (31 → 28/fev) e volta ao dia cheio no próximo mês
    // que o comporta (→ 31/mar). Monta a data por string p/ não sofrer fuso.
    const [y, m, d] = b.due_date.split('-').map(Number) // m: 1-12
    const diaAncora = b.recurrence_day ?? d
    const alvo = new Date(y, m, 1) // 1º dia do mês seguinte (JS é 0-based: índice m = mês m+1)
    const ano = alvo.getFullYear()
    const mes = alvo.getMonth() + 1 // 1-12
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const due = `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(diaAncora, ultimoDia)).padStart(2, '0')}`
    // idempotência: não duplica se o lançamento desse mês da série já existe
    // (cobre re-pagamento: paid → to_pay → paid)
    const { data: existe } = await supabase.from('entries').select('id')
      .eq('company_id', b.company_id).eq('type', b.type).eq('description', b.description)
      .eq('amount', b.amount).eq('due_date', due).eq('is_recurring', true).limit(1)
    if (existe && existe.length) return null
    return (await supabase.from('entries').insert({
      company_id: b.company_id,
      account_id: b.account_id,
      type: b.type,
      description: b.description,
      amount: b.amount,
      due_date: due,
      counterparty: b.counterparty,
      notes: b.notes,
      status: 'to_pay' as EntryStatus,
      is_recurring: true,
      recurrence_day: diaAncora,
      created_by: session?.user.id ?? null,
    })).error
  }, [session])

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    const competencyMonth = (form.competency_date || form.issue_date || form.due_date).substring(0, 7)
    if (closedPeriods.includes(competencyMonth)) {
      setErro('Período ' + competencyMonth + ' está fechado. Reabra o período antes de lançar.')
      setSalvando(false)
      return
    }
    // trava de integridade: sem conta do plano, o lançamento SOME da DRE (o JOIN o engole).
    if (!form.chart_of_account_id) {
      setErro('Escolha a "Conta do Plano de Contas" — sem ela o lançamento não aparece na DRE.')
      setSalvando(false)
      return
    }
    const status = form.status
    const payment_date = status === 'paid' && !form.payment_date ? hoje() : form.payment_date || null
    // dia-âncora da recorrência: novo lançamento ou alteração do vencimento
    // (re)ancora no dia do vencimento; edição que não mexe no venc preserva o dia
    const recurrence_day = form.is_recurring
      ? (!form.id || form.due_date !== form.dueOriginal
          ? Number(form.due_date.split('-')[2])
          : form.recurrence_day ?? Number(form.due_date.split('-')[2]))
      : null
    const payload = {
      company_id: form.company_id,
      account_id: form.account_id || null,
      type: tipo,
      description: form.description,
      amount: parseFloat(form.amount.replace(',', '.')),
      interest_amount: num(form.interest),
      fine_amount: num(form.fine),
      discount_amount: num(form.discount),
      // competência nunca nula: cai pra emissão e, por fim, vencimento (sempre preenchido)
      // — senão o lançamento sairia da DRE por competência pelo filtro de data.
      competency_date: form.competency_date || form.issue_date || form.due_date,
      chart_of_account_id: form.chart_of_account_id,
      dre_product_id: form.dre_product_id || null,
      refund_of_entry_id: form.refund_of_entry_id || null,
      issue_date: form.issue_date || null,
      due_date: form.due_date,
      payment_date,
      status,
      counterparty: form.counterparty || null,
      notes: form.notes || null,
      is_recurring: form.is_recurring,
      recurrence_day,
      ...(form.id ? {} : { created_by: session?.user.id }),
    }
    const { error } = form.id
      ? await supabase.from('entries').update(payload).eq('id', form.id)
      : await supabase.from('entries').insert(payload)
    setSalvando(false)
    if (error) { setErro('Erro ao salvar lançamento: ' + error.message); return }
    // recorrência: se o lançamento virou "pago" agora (ou já nasceu pago) e é
    // recorrente, gera o próximo mês — espelha o que o botão "marcar pago" faz.
    const virouPago = status === 'paid' && form.statusOriginal !== 'paid'
    if (form.is_recurring && virouPago) {
      const errRec = await inserirProximoMes({
        company_id: payload.company_id,
        account_id: payload.account_id,
        type: tipo,
        description: payload.description,
        amount: payload.amount,
        due_date: payload.due_date,
        counterparty: payload.counterparty,
        notes: payload.notes,
        recurrence_day,
      })
      if (errRec) setErro('Lançamento salvo, mas não foi possível gerar a recorrência do próximo mês: ' + errRec.message)
    }
    setModalAberto(false)
    toast(form.id ? 'Lançamento atualizado' : 'Lançamento criado')
    carregar()
  }

  const enviarParaPagamento = useCallback(async (l: Entry) => {
    const { error } = await supabase.from('entries').update({ status: 'pending' }).eq('id', l.id)
    if (error) { setErro('Erro ao atualizar status: ' + error.message); return }
    carregar()
  }, [carregar])

  const marcarPago = useCallback(async (l: Entry) => {
    const { error } = await supabase.from('entries').update({ payment_date: hoje(), status: 'paid' }).eq('id', l.id)
    if (error) { setErro('Erro ao marcar como pago: ' + error.message); return }
    if (l.is_recurring) {
      const errRec = await inserirProximoMes({
        company_id: l.company_id,
        account_id: l.account_id ?? null,
        type: l.type,
        description: l.description,
        amount: Number(l.amount),
        due_date: l.due_date,
        counterparty: l.counterparty ?? null,
        notes: l.notes ?? null,
        recurrence_day: l.recurrence_day,
      })
      if (errRec) setErro('Pago com sucesso, mas não foi possível gerar a recorrência do próximo mês: ' + errRec.message)
    }
    toast(tipo === 'payable' ? 'Conta paga' : 'Recebimento registrado')
    carregar()
  }, [carregar, inserirProximoMes, toast, tipo])

  const excluir = useCallback(async (l: Entry) => {
    const ehTransfer = !!l.transfer_id
    const msg = ehTransfer
      ? 'Excluir esta transferência? As duas pernas (saída e entrada) serão removidas.'
      : `Excluir "${l.description}"?`
    if (!(await confirmar({ titulo: ehTransfer ? 'Excluir transferência' : 'Excluir lançamento', mensagem: msg, confirmar: 'Excluir', perigo: true }))) return
    const { error } = ehTransfer
      ? await supabase.from('entries').delete().eq('transfer_id', l.transfer_id!)
      : await supabase.from('entries').delete().eq('id', l.id)
    if (error) { setErro('Erro ao excluir lançamento: ' + error.message); return }
    toast(ehTransfer ? 'Transferência excluída' : 'Lançamento excluído', 'info')
    carregar()
  }, [carregar, toast, confirmar])

  // Transferência entre contas: cria DOIS lançamentos pagos amarrados por um
  // transfer_id — saída (payable) na origem + entrada (receivable) no destino,
  // ambos SEM conta DRE (neutros no resultado). Cada perna fica na empresa da
  // sua própria conta (suporta transferência entre empresas).
  const salvarTransferencia = async () => {
    setErro(null)
    const origem = contas.find((c) => c.id === transferForm.origem)
    const destino = contas.find((c) => c.id === transferForm.destino)
    const valor = parseFloat(transferForm.amount.replace(',', '.'))
    if (!origem || !destino) { setErro('Escolha as contas de origem e destino.'); return }
    if (origem.id === destino.id) { setErro('Origem e destino devem ser contas diferentes.'); return }
    if (!valor || valor <= 0) { setErro('Informe um valor maior que zero.'); return }
    if (!transferForm.date) { setErro('Informe a data da transferência.'); return }
    setTransferindo(true)
    const transferId = crypto.randomUUID()
    const desc = transferForm.description.trim() || `Transferência: ${origem.name} → ${destino.name}`
    const base = {
      amount: valor,
      due_date: transferForm.date,
      competency_date: transferForm.date,
      payment_date: transferForm.date,
      status: 'paid' as EntryStatus,
      chart_of_account_id: null,
      transfer_id: transferId,
      description: desc,
      created_by: session?.user.id ?? null,
    }
    const { error } = await supabase.from('entries').insert([
      { ...base, company_id: origem.company_id, account_id: origem.id, type: 'payable' as EntryType },
      { ...base, company_id: destino.company_id, account_id: destino.id, type: 'receivable' as EntryType },
    ])
    setTransferindo(false)
    if (error) { setErro('Erro ao registrar a transferência: ' + error.message); return }
    setTransferAberto(false)
    setTransferForm({ origem: '', destino: '', amount: '', date: hoje(), description: '' })
    carregar()
  }

  const processarArquivo = async (file: File) => {
    setImportErro(null)
    setImportLinhas([])
    setImportHeaders([])
    try {
      let rows: string[][]
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text()
        rows = parseCsv(text)
      } else {
        const XLSX = await import('xlsx')
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
      }
      if (rows.length < 2) { setImportErro('Arquivo vazio ou sem linhas de dados.'); return }
      const [headers, ...data] = rows
      setImportHeaders(headers.map(String))
      setImportLinhas(data.map(r => r.map(String)))
    } catch (e) {
      setImportErro('Erro ao ler arquivo: ' + String(e))
    }
  }

  const confirmarImport = async () => {
    setImportando(true)
    setImportErro(null)
    const idx = mapColunas(importHeaders)
    if (idx.description === undefined || idx.amount === undefined || idx.due_date === undefined) {
      setImportErro('Colunas obrigatórias não encontradas. Verifique se o cabeçalho tem: Descrição, Valor, Vencimento.')
      setImportando(false)
      return
    }
    const contaByName = (name: string) => contas.find(c => normalizar(c.name) === normalizar(name))?.id ?? null
    // em "Consolidado" (sem empresa ativa) o import iria pra empresas[0] arbitrariamente — bloqueia
    // e exige escolher a empresa no seletor global (mesmo padrao do Hotmart).
    const cid = empresaAtiva?.id ?? ''
    if (!cid) {
      setImportErro('Selecione uma empresa no seletor do topo antes de importar (não dá pra importar em "Consolidado").')
      setImportando(false)
      return
    }
    const payload = importLinhas
      .filter(r => r[idx.description]?.trim())
      .map(r => ({
        company_id: cid,
        type: tipo,
        description: r[idx.description].trim(),
        amount: parseValor(r[idx.amount] ?? ''),
        due_date: parseData(r[idx.due_date] ?? ''),
        interest_amount: idx.interest !== undefined ? parseValor(r[idx.interest] ?? '') : 0,
        fine_amount: idx.fine !== undefined ? parseValor(r[idx.fine] ?? '') : 0,
        discount_amount: idx.discount !== undefined ? parseValor(r[idx.discount] ?? '') : 0,
        issue_date: idx.issue_date !== undefined ? parseData(r[idx.issue_date] ?? '') || null : null,
        counterparty: idx.counterparty !== undefined ? r[idx.counterparty]?.trim() || null : null,
        account_id: idx.account !== undefined ? contaByName(r[idx.account] ?? '') : null,
        notes: idx.notes !== undefined ? r[idx.notes]?.trim() || null : null,
        status: (idx.status !== undefined ? STATUS_MAP[normalizar(r[idx.status] ?? '')] : undefined) ?? ('to_pay' as EntryStatus),
        is_recurring: idx.recurring !== undefined
          ? ['sim', 'yes', 'true', '1', 'x'].includes(normalizar(r[idx.recurring] ?? ''))
          : false,
        created_by: session?.user.id ?? null,
      }))
      .filter(r => r.amount > 0 && r.due_date)
    if (payload.length === 0) {
      setImportErro('Nenhuma linha válida (Valor > 0 e Vencimento no formato DD/MM/AAAA ou AAAA-MM-DD).')
      setImportando(false)
      return
    }
    const { error } = await supabase.from('entries').insert(payload)
    setImportando(false)
    if (error) { setImportErro('Erro ao importar: ' + error.message); return }
    fecharImport()
    carregar()
  }

  const fecharImport = () => {
    setImportAberto(false)
    setImportLinhas([])
    setImportHeaders([])
    setImportErro(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const downloadTemplate = useCallback(() => {
    const ehPagar = tipo === 'payable'
    const cols = ['Descrição', 'Valor', 'Vencimento', 'Emissão', ehPagar ? 'Fornecedor' : 'Cliente', 'Conta', 'Observações', 'Recorrente', 'Juros', 'Multa', 'Desconto']
    const ex = ['Aluguel escritório', '2500,00', '2026-07-10', '2026-07-01', 'João Imóveis', 'Conta Corrente', 'Mensalidade', 'sim', '', '', '']
    const csv = [cols.join(';'), ex.join(';')].join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `modelo_${ehPagar ? 'pagar' : 'receber'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [tipo])

  const importColIdx = useMemo(() => mapColunas(importHeaders), [importHeaders])
  const importValidas = useMemo(
    () => importLinhas.filter(r => r[importColIdx.description ?? -1]?.trim()).length,
    [importLinhas, importColIdx]
  )

  // busca textual (descrição/contraparte) aplicada no cliente — instantânea e
  // sem nova requisição por tecla (entries é uma tabela pequena)
  const lancamentosExibidos = useMemo(() => {
    const q = normalizar(busca) // ignora acento/caixa, igual ao fluxo de import
    if (!q) return lancamentos
    return lancamentos.filter((l) =>
      normalizar(l.description).includes(q) || normalizar(l.counterparty ?? '').includes(q)
    )
  }, [lancamentos, busca])

  const totais = useMemo(() => ({
    aPagar: lancamentosExibidos.filter((l) => l.status === 'to_pay' && !l.transfer_id).reduce((s, l) => s + Number(l.amount), 0),
    pendente: lancamentosExibidos.filter((l) => l.status === 'pending' && !l.transfer_id).reduce((s, l) => s + Number(l.amount), 0),
    // "Pago/Recebido" = caixa que de fato moveu (transferências não entram aqui)
    pago: lancamentosExibidos.filter((l) => l.status === 'paid' && !l.transfer_id).reduce((s, l) => s + valorPago(l), 0),
  }), [lancamentosExibidos])

  // intercompany: lançamento cuja conta pagadora é de OUTRA empresa (empresa A paga
  // conta de B). É legítimo por design (decisão do Luiz 2026-06-30) — só sinaliza, não bloqueia.
  const intercompany = useMemo(
    () => lancamentosExibidos.filter((l) => l.account && l.account.company_id !== l.company_id),
    [lancamentosExibidos]
  )

  // total da coluna Valor (rodapé da tabela): exclui cancelados (anulados não
  // contam), exceto quando o filtro é justamente "Cancelado" — assim o rodapé
  // concilia com os cards (A pagar + Pendente + Pago)
  const totalValor = useMemo(
    () => lancamentosExibidos
      .filter((l) => (filtroStatus === 'cancelled' || l.status !== 'cancelled') && !l.transfer_id)
      .reduce((s, l) => s + Number(l.amount), 0),
    [lancamentosExibidos, filtroStatus]
  )

  // se o filtro de empresa coincide com o escopo global, trata como "sem filtro"
  // (a empresa ativa é omitida das opções — evita o select renderizar em branco)
  const filtroEmpresaVisivel = filtroEmpresa && filtroEmpresa !== empresaAtiva?.id ? filtroEmpresa : ''
  const temFiltro = !!(busca || filtroStatus || filtroEmpresaVisivel || dataDe || dataAte)
  const limparFiltros = () => {
    setBusca('')
    setFiltroStatus('')
    setFiltroEmpresa('')
    setDataDe('')
    setDataAte('')
  }

  const ehPagar = tipo === 'payable'

  // ── seleção em massa (só conta os marcados que estão VISÍVEIS; respeita filtro/busca) ──
  const idsVisiveis = new Set(lancamentosExibidos.map((l) => l.id))
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id] && idsVisiveis.has(id))
  const selectedEntries = lancamentosExibidos.filter((l) => rowSelection[l.id])

  // espelha as transições individuais: "pago" grava a data de hoje e, para os
  // recorrentes, gera o lançamento do próximo mês (inserirProximoMes é idempotente)
  const aplicarStatusEmMassa = async (novoStatus: EntryStatus) => {
    if (selectedEntries.length === 0) return
    const n = selectedEntries.length
    if (novoStatus === 'paid') {
      const recorrentes = selectedEntries.filter((l) => l.is_recurring && l.status !== 'paid')
      const palavra = ehPagar ? 'pago' : 'recebido'
      const aviso =
        `Marcar ${n} ${n === 1 ? 'lançamento' : 'lançamentos'} como ${palavra}${n === 1 ? '' : 's'} com a data de hoje?` +
        (recorrentes.length
          ? `\n\n${recorrentes.length} ${recorrentes.length === 1 ? 'é recorrente e vai gerar' : 'são recorrentes e vão gerar'} o lançamento do próximo mês.`
          : '')
      if (!(await confirmar({ titulo: 'Marcar como pago', mensagem: aviso }))) return
      const { error } = await supabase.from('entries').update({ status: 'paid', payment_date: hoje() }).in('id', selectedIds)
      if (error) { setErro('Erro ao marcar como pago em massa: ' + error.message); return }
      const errs = await Promise.all(
        recorrentes.map((l) =>
          inserirProximoMes({
            company_id: l.company_id,
            account_id: l.account_id ?? null,
            type: l.type,
            description: l.description,
            amount: Number(l.amount),
            due_date: l.due_date,
            counterparty: l.counterparty ?? null,
            notes: l.notes ?? null,
            recurrence_day: l.recurrence_day,
          })
        )
      )
      const falhas = errs.filter(Boolean).length
      if (falhas) setErro(`Marcados como ${palavra}s, mas ${falhas} recorrência(s) do próximo mês falharam.`)
    } else {
      const { error } = await supabase.from('entries').update({ status: novoStatus }).in('id', selectedIds)
      if (error) { setErro('Erro ao alterar status em massa: ' + error.message); return }
    }
    setRowSelection({})
    toast(`${n} ${n === 1 ? 'lançamento atualizado' : 'lançamentos atualizados'}`)
    carregar()
  }

  // mover os selecionados para outra empresa (com confirm)
  const aplicarEmpresaEmMassa = async (companyId: string) => {
    if (selectedIds.length === 0 || !companyId) return
    const emp = empresas.find((e) => e.id === companyId)
    const n = selectedIds.length
    if (!(await confirmar({ titulo: 'Mover empresa', mensagem: `Mover ${n} ${n === 1 ? 'lançamento' : 'lançamentos'} para a empresa "${emp?.name ?? ''}"?` }))) return
    // conta de outra empresa é INTERCOMPANY legítimo (empresa A paga conta de B) — NÃO desvincula,
    // só detecta pra avisar no toast (o badge na lista sinaliza permanentemente).
    const { data: sel } = await supabase
      .from('entries').select('id, account_id, account:accounts!account_id(company_id)').in('id', selectedIds)
    const cross = ((sel ?? []) as unknown as { id: string; account_id: string | null; account: { company_id: string | null } | null }[])
      .filter((e) => e.account_id && e.account?.company_id && e.account.company_id !== companyId).length
    const { error } = await supabase.from('entries').update({ company_id: companyId }).in('id', selectedIds)
    if (error) { setErro('Erro ao alterar a empresa em massa: ' + error.message); return }
    setRowSelection({})
    toast(`${n} ${n === 1 ? 'lançamento movido' : 'lançamentos movidos'} para ${emp?.name ?? 'a empresa'}` +
      (cross > 0 ? ` · ${cross} ficaram intercompany (conta de outra empresa) — revise se preciso` : ''))
    carregar()
  }

  const colunas = useMemo<DataColumn<Entry>[]>(() => [
    { id: 'description', header: 'Descrição', size: 240, cell: (l) => (
      <div>
        <p className="font-medium text-fg flex items-center gap-1">
          {l.description}
          {l.is_recurring && <span title="Recorrente"><Repeat size={13} className="text-brand shrink-0" /></span>}
        </p>
        {l.counterparty && <p className="text-xs text-fg-subtle">{l.counterparty}</p>}
      </div>
    ), footer: 'Total' },
    ...(empresas.length > 1 ? [{
      id: 'empresa', header: 'Empresa', size: 160, cell: (l: Entry) => {
        const emp = empresas.find((e) => e.id === l.company_id)
        // conta pagadora de outra empresa = intercompany (legítimo) → sinaliza qual empresa pagou
        const contaEmp = l.account && l.account.company_id !== l.company_id
          ? empresas.find((e) => e.id === l.account?.company_id) : null
        return (
          <div>
            {emp ? <span className="text-fg-muted">{emp.name}</span> : <span className="text-fg-subtle">—</span>}
            {contaEmp && (
              <span title={`Pago pela conta da ${contaEmp.name} (intercompany)`} className="ml-1 align-middle">
                <Badge tom="warning">intercompany</Badge>
              </span>
            )}
          </div>
        )
      },
    } satisfies DataColumn<Entry>] : []),
    { id: 'chart_of_account', header: 'Conta DRE', size: 160, cell: (l) =>
      l.chart_of_account
        ? <span className="text-xs text-fg-muted font-mono">{l.chart_of_account.code} – {l.chart_of_account.name}</span>
        : <span className="text-fg-subtle">—</span>
    },
    { id: 'issue_date', header: 'Emissão', size: 110, cell: (l) => <span className="text-fg-muted tnum">{fmtData(l.issue_date)}</span> },
    { id: 'due_date', header: 'Vencimento', size: 110, cell: (l) => <span className="text-fg-muted tnum">{fmtData(l.due_date)}</span> },
    { id: 'payment_date', header: 'Pagamento', size: 110, cell: (l) => <span className="text-fg-muted tnum">{fmtData(l.payment_date)}</span> },
    { id: 'amount', header: 'Valor', size: 120, align: 'right', cell: (l) => {
      const temEncargo = Number(l.interest_amount) + Number(l.fine_amount) + Number(l.discount_amount) !== 0
      return (
        <div>
          <span className="font-semibold tnum">{fmtBRL(Number(l.amount))}</span>
          {temEncargo && (
            <p className="text-xs text-fg-subtle tnum" title="Juros + multa − desconto">
              {ehPagar ? 'pago' : 'receb.'} {fmtBRL(valorPago(l))}
            </p>
          )}
        </div>
      )
    }, footer: fmtBRL(totalValor) },
    { id: 'interest', header: 'Juros', size: 100, align: 'right', cell: (l) =>
      Number(l.interest_amount)
        ? <span className="text-fg-muted tnum">{fmtBRL(Number(l.interest_amount))}</span>
        : <span className="text-fg-subtle">—</span>
    },
    { id: 'fine', header: 'Multa', size: 100, align: 'right', cell: (l) =>
      Number(l.fine_amount)
        ? <span className="text-fg-muted tnum">{fmtBRL(Number(l.fine_amount))}</span>
        : <span className="text-fg-subtle">—</span>
    },
    { id: 'discount', header: 'Desconto', size: 100, align: 'right', cell: (l) =>
      Number(l.discount_amount)
        ? <span className="text-fg-muted tnum">{fmtBRL(Number(l.discount_amount))}</span>
        : <span className="text-fg-subtle">—</span>
    },
    { id: 'status', header: 'Status', size: 104, align: 'right', cell: (l) => l.transfer_id ? <Badge tom="brand">Transferência</Badge> : <StatusBadge status={l.status} tipo={tipo} /> },
    { id: 'acoes', header: '', label: 'Ações', size: 96, align: 'right', enableHiding: false, cell: (l) => (
      <div className="flex gap-2 justify-end">
        {isAdmin && l.status === 'to_pay' && (
          <button title="Enviar para pagamento" onClick={() => enviarParaPagamento(l)} className="text-brand hover:text-brand-strong">
            <ArrowRight size={17} />
          </button>
        )}
        {isAdmin && l.status === 'pending' && (
          <button title={ehPagar ? 'Marcar como pago' : 'Marcar como recebido'} onClick={() => marcarPago(l)} className="text-revenue hover:brightness-90">
            <CheckCircle2 size={17} />
          </button>
        )}
        {isAdmin && (
          <button title="Editar" onClick={() => abrirEdicao(l)} className="text-fg-subtle hover:text-brand">
            <Pencil size={16} />
          </button>
        )}
        {isAdmin && (
          <button title="Excluir" onClick={() => excluir(l)} className="text-fg-subtle hover:text-expense">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    ) },
  ], [isAdmin, ehPagar, tipo, totalValor, empresas, enviarParaPagamento, marcarPago, abrirEdicao, excluir])

  // Exporta os lançamentos EXIBIDOS (respeita filtros + busca) — reusa o helper de relatório.
  const exportar = (formato: 'xlsx' | 'csv') => {
    const statusLabel = (s: string) => (({
      to_pay: ehPagar ? 'A pagar' : 'A receber', pending: 'Pendente',
      paid: ehPagar ? 'Pago' : 'Recebido', cancelled: 'Cancelado', refunded: 'Estornado',
    }) as Record<string, string>)[s] ?? s
    const header = ['Descrição', 'Contraparte', 'Empresa', 'Conta do Plano', 'Produto DRE', 'Emissão', 'Vencimento', 'Pagamento', 'Valor', 'Juros', 'Multa', 'Desconto', 'Status']
    const linhas: (string | number)[][] = lancamentosExibidos.map((l) => [
      l.description ?? '',
      l.counterparty ?? '',
      empresas.find((e) => e.id === l.company_id)?.name ?? '',
      l.chart_of_account ? `${l.chart_of_account.code} – ${l.chart_of_account.name}` : '',
      l.dre_product?.name ?? '',
      l.issue_date ? fmtData(l.issue_date) : '',
      fmtData(l.due_date),
      l.payment_date ? fmtData(l.payment_date) : '',
      Number(l.amount),
      Number(l.interest_amount ?? 0),
      Number(l.fine_amount ?? 0),
      Number(l.discount_amount ?? 0),
      statusLabel(l.status),
    ])
    const nome = `${ehPagar ? 'contas-a-pagar' : 'contas-a-receber'}_${(empresaAtiva?.name ?? 'todas').replace(/\s+/g, '-')}`
    if (formato === 'xlsx') exportTabelaXLSX(header, linhas, nome, ehPagar ? 'Contas a Pagar' : 'Contas a Receber').catch(console.error)
    else exportTabelaCSV(header, linhas, nome)
  }

  return (
    <div>
      <PageHeader
        titulo={ehPagar ? 'Contas a Pagar' : 'Contas a Receber'}
        subtitulo="Fluxo: Emissão → Vencimento → Pagamento"
        acao={
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => exportar('xlsx')} disabled={lancamentosExibidos.length === 0} className={btnSecundario}>
              <Download size={16} /> Excel
            </button>
            <button onClick={() => exportar('csv')} disabled={lancamentosExibidos.length === 0} className={btnSecundario}>
              CSV
            </button>
            {isAdmin && (
              <>
                <button onClick={() => setTransferAberto(true)} className={btnSecundario}>
                  <ArrowLeftRight size={16} /> Transferência
                </button>
                <button onClick={() => setImportAberto(true)} className={btnSecundario}>
                  <Upload size={16} /> Importar
                </button>
                <button onClick={abrirNovo} className={btnPrimario}>
                  <Plus size={16} /> Novo lançamento
                </button>
              </>
            )}
          </div>
        }
      />

      <ErroBanner mensagem={erro} />

      <div className="mb-6">
        <KPIStrip cols={3}>
          <KPICard bare tom="expense" label={ehPagar ? 'A pagar' : 'A receber'} valor={fmtBRL(totais.aPagar)} />
          <KPICard bare tom="warning" label="Pendente" valor={fmtBRL(totais.pendente)} />
          <KPICard bare tom="revenue" label={ehPagar ? 'Pago' : 'Recebido'} valor={fmtBRL(totais.pago)} />
        </KPIStrip>
      </div>

      {intercompany.length > 0 && (
        <div className="mb-4">
          <Alert tom="info">
            {intercompany.length} {intercompany.length === 1 ? 'lançamento é' : 'lançamentos são'} intercompany
            {' '}({fmtBRL(intercompany.reduce((s, l) => s + Number(l.amount), 0))}) — pagos pela conta de outra empresa.
            É legítimo por design; a coluna Empresa marca cada um.
          </Alert>
        </div>
      )}

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-64">
            <label className="block text-sm font-medium mb-1">Buscar</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input
                className={inputCls + ' pl-9'}
                placeholder={`Descrição ou ${ehPagar ? 'fornecedor' : 'cliente'}…`}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Vencimento</label>
            <DateRangePicker de={dataDe} ate={dataAte} onChange={(d, a) => { setDataDe(d); setDataAte(a) }} />
          </div>
          <div className="w-44">
            <label className="block text-sm font-medium mb-1">Status</label>
            <select className={inputCls} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="to_pay">{ehPagar ? 'A pagar' : 'A receber'}</option>
              <option value="pending">Pendente</option>
              <option value="paid">{ehPagar ? 'Pago' : 'Recebido'}</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          {empresas.length > 1 && (
            <div className="w-48">
              <label className="block text-sm font-medium mb-1">Empresa</label>
              <select className={inputCls} value={filtroEmpresaVisivel} onChange={(e) => setFiltroEmpresa(e.target.value)}>
                <option value="">{empresaAtiva ? `Apenas ${empresaAtiva.name}` : 'Todas as empresas'}</option>
                {empresas.filter((e) => e.id !== empresaAtiva?.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          {temFiltro && (
            <button type="button" onClick={limparFiltros} className="text-sm text-fg-muted hover:text-brand underline pb-2">
              Limpar filtros
            </button>
          )}
        </div>
      </Card>

      {isAdmin && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-card border border-brand-subtle bg-brand-subtle flex-wrap">
          <span className="text-sm font-semibold text-brand whitespace-nowrap">
            {selectedIds.length} selecionado{selectedIds.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-fg-muted">Status:</span>
            <select
              value=""
              onChange={(e) => { const v = e.target.value as EntryStatus | ''; if (v) aplicarStatusEmMassa(v) }}
              className="rounded-control border border-border-strong px-2 py-1.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="" disabled>Escolher…</option>
              <option value="to_pay">{ehPagar ? 'A pagar' : 'A receber'}</option>
              <option value="pending">Pendente</option>
              <option value="paid">{ehPagar ? 'Pago' : 'Recebido'}</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          {empresas.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-fg-muted">Empresa:</span>
              <select
                value=""
                onChange={(e) => { const v = e.target.value; if (v) aplicarEmpresaEmMassa(v) }}
                className="rounded-control border border-border-strong px-2 py-1.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="" disabled>Escolher…</option>
                {empresas.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
          )}
          <button onClick={() => setRowSelection({})} className="ml-auto text-xs font-medium text-fg-muted hover:text-fg whitespace-nowrap">
            Limpar seleção
          </button>
        </div>
      )}

      <Card>
        {lancamentosExibidos.length === 0 ? (
          <Vazio mensagem={carregando ? 'Carregando…' : busca && lancamentos.length > 0 ? 'Nenhum lançamento para essa busca.' : 'Nenhum lançamento encontrado.'} />
        ) : (
          <DataTable
            tableKey={`lancamentos:${tipo}`}
            columns={colunas}
            data={lancamentosExibidos}
            getRowId={(l) => l.id}
            enableSelection={isAdmin}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
          />
        )}
      </Card>

      {/* Modal: novo/editar lançamento */}
      <Modal titulo={form.id ? 'Editar lançamento' : 'Novo lançamento'} aberto={modalAberto} onFechar={() => setModalAberto(false)}>
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Descrição *</label>
              <input required className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {empresas.length > 1 && (
              <div>
                <label className="block text-sm font-medium mb-1">Empresa *</label>
                <select required className={inputCls} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value, account_id: '' })}>
                  <option value="">Selecione…</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Valor (R$) *</label>
              <input required inputMode="decimal" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data de emissão</label>
              <input type="date" className={inputCls} value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data de Competência</label>
              <input type="date" className={inputCls} value={form.competency_date} onChange={(e) => setForm({ ...form, competency_date: e.target.value })} />
              <p className="text-xs text-fg-subtle mt-0.5">Usada na DRE. Se vazia, usa a data de emissão.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vencimento *</label>
              <input type="date" required className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data de pagamento</label>
              <input type="date" className={inputCls} value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status *</label>
              <select required className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EntryStatus })}>
                <option value="to_pay">{ehPagar ? 'A pagar' : 'A receber'}</option>
                <option value="pending">Pendente</option>
                <option value="paid">{ehPagar ? 'Pago' : 'Recebido'}</option>
                <option value="cancelled">Cancelado</option>
                <option value="refunded">Estornado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Conta do Plano de Contas <span className="text-expense">*</span></label>
              <select className={inputCls} value={form.chart_of_account_id} onChange={(e) => setForm({ ...form, chart_of_account_id: e.target.value })}>
                <option value="">— Escolha a conta (obrigatório p/ DRE) —</option>
                {chartAccounts.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Produto / Centro de Custo</label>
              <select className={inputCls} value={form.dre_product_id} onChange={(e) => setForm({ ...form, dre_product_id: e.target.value })}>
                <option value="">— Herdar da conta do Plano —</option>
                {dreProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-xs text-fg-subtle mt-1">Vazio = usa o produto vinculado à conta acima (na DRE por Produto). Escolha aqui só pra sobrepor.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Conta</label>
              <select className={inputCls} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                <option value="">Sem conta</option>
                {contas.filter((c) => !form.company_id || c.company_id === form.company_id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{ehPagar ? 'Fornecedor' : 'Cliente'}</label>
              <input className={inputCls} value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
            </div>
            <div className="col-span-2">
              <p className="text-sm font-medium mb-1">Encargos e desconto <span className="font-normal text-fg-subtle">(no pagamento)</span></p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-fg-muted mb-1">Juros (R$)</label>
                  <input inputMode="decimal" className={inputCls} value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-fg-muted mb-1">Multa (R$)</label>
                  <input inputMode="decimal" className={inputCls} value={form.fine} onChange={(e) => setForm({ ...form, fine: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-fg-muted mb-1">Desconto (R$)</label>
                  <input inputMode="decimal" className={inputCls} value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
                </div>
              </div>
              {(num(form.interest) || num(form.fine) || num(form.discount)) ? (
                <p className="text-xs text-fg-muted mt-1.5">
                  {ehPagar ? 'Valor a pagar' : 'Valor a receber'}:{' '}
                  <span className="font-semibold text-fg tnum">
                    {fmtBRL(num(form.amount) + num(form.interest) + num(form.fine) - num(form.discount))}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Observações</label>
              <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border-strong text-brand focus:ring-brand"
                  checked={form.is_recurring}
                  onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                />
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <Repeat size={14} className="text-brand" />
                  Recorrente — cria automaticamente o próximo mês ao pagar
                </span>
              </label>
            </div>
          </div>
          <button type="submit" disabled={salvando} className={btnPrimario + ' w-full justify-center'}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      </Modal>

      {/* Modal: transferência entre contas */}
      <Modal titulo="Transferência entre contas" aberto={transferAberto} onFechar={() => setTransferAberto(false)}>
        <div className="space-y-4">
          <p className="text-xs text-fg-subtle">
            Move dinheiro de uma conta pra outra: cria uma <strong>saída</strong> na origem e uma <strong>entrada</strong> no destino. Não entra na DRE — transferência é neutra no resultado.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Conta de origem *</label>
              <select className={inputCls} value={transferForm.origem} onChange={(e) => setTransferForm({ ...transferForm, origem: e.target.value })}>
                <option value="">Selecione…</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{empresas.length > 1 ? ` — ${empresas.find((e) => e.id === c.company_id)?.name ?? ''}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Conta de destino *</label>
              <select className={inputCls} value={transferForm.destino} onChange={(e) => setTransferForm({ ...transferForm, destino: e.target.value })}>
                <option value="">Selecione…</option>
                {contas.filter((c) => c.id !== transferForm.origem).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{empresas.length > 1 ? ` — ${empresas.find((e) => e.id === c.company_id)?.name ?? ''}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Valor (R$) *</label>
              <input inputMode="decimal" className={inputCls} value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} placeholder="0,00" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data *</label>
              <input type="date" className={inputCls} value={transferForm.date} onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Descrição</label>
              <input className={inputCls} value={transferForm.description} onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })} placeholder="Opcional — ex.: Aporte no caixa" />
            </div>
          </div>
          {contas.length < 2 && (
            <p className="text-xs text-warning">Você precisa de pelo menos 2 contas cadastradas em Contas &amp; Cartões.</p>
          )}
          <button onClick={salvarTransferencia} disabled={transferindo || contas.length < 2} className={btnPrimario + ' w-full justify-center'}>
            {transferindo ? 'Registrando…' : 'Registrar transferência'}
          </button>
        </div>
      </Modal>

      {/* Modal: importar planilha */}
      <Modal titulo="Importar Lançamentos" aberto={importAberto} onFechar={fecharImport}>
        <div className="space-y-4">
          {empresaAtiva ? (
            <Alert tom="info">Importar para a empresa <span className="font-semibold text-fg">{empresaAtiva.name}</span> (o seletor do topo).</Alert>
          ) : (
            <Alert tom="warning">Você está em <span className="font-semibold text-fg">Consolidado</span>. Selecione uma empresa no seletor do topo para importar.</Alert>
          )}
          <div className="rounded-card bg-surface-2 border border-border p-3 text-xs text-fg-muted leading-relaxed">
            <p className="font-semibold text-fg mb-1">Colunas reconhecidas no cabeçalho (case insensitive):</p>
            <p><span className="font-medium text-fg">Obrigatórias:</span> Descrição · Valor · Vencimento</p>
            <p><span className="font-medium text-fg">Opcionais:</span> Emissão · {ehPagar ? 'Fornecedor' : 'Cliente'} · Conta · Observações · Status · Recorrente · Juros · Multa · Desconto</p>
            <p className="mt-1.5 text-fg-subtle">Datas: DD/MM/AAAA ou AAAA-MM-DD · Valores: vírgula ou ponto decimal · Recorrente: sim/não</p>
          </div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Arquivo (.xlsx ou .csv)</label>
            <button type="button" onClick={downloadTemplate} className="text-xs text-brand hover:text-brand-strong underline">
              Baixar modelo CSV
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            className={inputCls}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivo(f) }}
          />
          {importErro && <p className="text-sm text-expense">{importErro}</p>}
          {importLinhas.length > 0 && (
            <>
              <p className="text-sm text-fg-muted">
                <span className="font-semibold text-fg">{importValidas}</span> linha{importValidas !== 1 ? 's' : ''} válida{importValidas !== 1 ? 's' : ''} encontrada{importValidas !== 1 ? 's' : ''}
              </p>
              <div className="overflow-x-auto rounded-card border border-border">
                <table className="text-xs min-w-full">
                  <thead className="bg-surface-2 border-b border-border">
                    <tr>
                      {importHeaders.map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-left font-medium text-fg-muted whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {importLinhas.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        {importHeaders.map((_, j) => (
                          <td key={j} className="px-2 py-1.5 text-fg whitespace-nowrap">{row[j] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importLinhas.length > 5 && (
                <p className="text-xs text-fg-subtle">… e mais {importLinhas.length - 5} linha{importLinhas.length - 5 !== 1 ? 's' : ''}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={confirmarImport}
                  disabled={importando || importValidas === 0 || !empresaAtiva}
                  className={btnPrimario + ' flex-1 justify-center'}
                >
                  {importando ? 'Importando…' : `Importar ${importValidas} lançamento${importValidas !== 1 ? 's' : ''}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportLinhas([])
                    setImportHeaders([])
                    setImportErro(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className={btnSecundario}
                >
                  Limpar
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
