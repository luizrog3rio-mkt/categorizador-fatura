import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Plus, Pencil, CheckCircle2, Trash2, ArrowRight, ArrowLeftRight, Repeat, Upload, Search, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, fmtData, hoje } from '../lib/format'
import { valorEfetivo } from '../lib/entries'
import type { Account, Entry, EntryType, EntryStatus } from '../lib/types'
import type { ChartOfAccount, DreProduct } from '../lib/types'
import { Card, PageHeader, StatusBadge, Badge, Vazio, Modal, ErroBanner, Alert, KPICard, KPIStrip, inputCls, btnPrimario, btnSecundario } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'
import { exportTabelaCSV, exportTabelaXLSX } from '../lib/exportTabela'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import type { RowSelectionState } from '@tanstack/react-table'
import DateRangePicker from '../components/DateRangePicker'
import {
  avancarUmMes,
  contaCompativelComLancamento,
  contaDisponivelParaEmpresa,
  mapearColunasImportacao,
  normalizarTexto,
  parseCsv,
  parseDataPlanilha,
  parseValorPlanilha,
  rotuloContaContabil,
  tributoSobreVendaMencionado,
} from '../lib/lancamentos'

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

// parse de campo do form (vírgula ou ponto decimal); vazio = 0
const num = (s: string) => parseFloat((s ?? '').replace(',', '.')) || 0

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
  const [filtroConta, setFiltroConta] = useState<'' | 'sem' | 'com'>('') // classificação (Conta DRE)
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [emissaoDe, setEmissaoDe] = useState('')
  const [emissaoAte, setEmissaoAte] = useState('')
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState<FormState>(formVazio(''))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [truncado, setTruncado] = useState(false) // bateu o teto de 1000 linhas do PostgREST
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccount[]>([])
  const [dreProducts, setDreProducts] = useState<DreProduct[]>([])
  // fechado É por empresa — guardar o par evita bloquear a empresa A por período fechado só na B
  const [closedPeriods, setClosedPeriods] = useState<{ company_id: string; period: string }[]>([])

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
    if (filtroConta === 'sem') q = q.is('chart_of_account_id', null)
    else if (filtroConta === 'com') q = q.not('chart_of_account_id', 'is', null)
    if (dataDe) q = q.gte('due_date', dataDe)
    if (dataAte) q = q.lte('due_date', dataAte)
    if (emissaoDe) q = q.gte('issue_date', emissaoDe)
    if (emissaoAte) q = q.lte('issue_date', emissaoAte)
    const { data, error } = await q
    if (error) setErro('Erro ao carregar lançamentos: ' + error.message)
    else {
      const rows = (data as Entry[]) ?? []
      setLancamentos(rows)
      setTruncado(rows.length >= 1000) // PostgREST corta em 1000 — avisa pra refinar filtros
    }
    setCarregando(false)
  }, [tipo, empresaAtiva, filtroStatus, filtroConta, filtroEmpresa, dataDe, dataAte, emissaoDe, emissaoAte])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    supabase.from('accounts').select('*').eq('active', true).order('name').then(({ data }) => setContas(data ?? []))
    supabase.from('chart_of_accounts').select('*').eq('active', true).eq('is_analytical', true).order('tipo').order('sort_order').then(({ data }) => setChartAccounts(data ?? []))
    supabase.from('dre_products').select('*').eq('active', true).order('sort_order').then(({ data }) => setDreProducts(data ?? []))
    supabase.from('closed_periods').select('company_id, period').then(({ data }) => setClosedPeriods(data ?? []))
  }, [])

  const contasContabeisDisponiveis = useMemo(() => chartAccounts.filter((conta) =>
    contaDisponivelParaEmpresa(conta, form.company_id) && contaCompativelComLancamento(conta, tipo)
  ), [chartAccounts, form.company_id, tipo])
  const contasResultadoDisponiveis = contasContabeisDisponiveis.filter((conta) => conta.tipo === 'resultado')
  const contasPatrimoniaisDisponiveis = contasContabeisDisponiveis.filter((conta) => conta.tipo === 'patrimonial')

  const contaContabilSelecionada = chartAccounts.find((conta) => conta.id === form.chart_of_account_id)
  const tributoMencionado = tributoSobreVendaMencionado(form.description)

  const abrirNovo = () => {
    setForm(formVazio(empresaAtiva?.id ?? empresas[0]?.id ?? ''))
    setModalAberto(true)
  }

  const abrirEdicao = useCallback((l: Entry) => {
    // transferência é um PAR amarrado por transfer_id, sem conta do plano (neutra na DRE). Editar
    // uma perna aqui obrigaria a conta do plano (trava do save) e quebraria a neutralidade → some
    // vira despesa/receita-fantasma. Editar transferência = excluir e recriar em /transferencias.
    if (l.transfer_id) {
      setErro('Transferências não são editadas por aqui (quebraria o par). Para ajustar, exclua e recrie em Transferências.')
      return
    }
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
    issue_date: string; competency_date: string
    chart_of_account_id: string | null; dre_product_id: string | null
    counterparty: string | null; notes: string | null; recurrence_day: number | null
  }) => {
    if (!b.chart_of_account_id) return { message: 'classifique a conta contábil antes de gerar a recorrência' }
    // avança 1 mês mantendo o DIA-ÂNCORA da série (recurrence_day): só faz clamp
    // no mês que não tem o dia (31 → 28/fev) e volta ao dia cheio no próximo mês
    // que o comporta (→ 31/mar). Monta a data por string p/ não sofrer fuso.
    const diaAncora = b.recurrence_day ?? Number(b.due_date.split('-')[2])
    const due = avancarUmMes(b.due_date, diaAncora)
    const issue = avancarUmMes(b.issue_date)
    const competency = avancarUmMes(b.competency_date)
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
      issue_date: issue,
      competency_date: competency,
      due_date: due,
      chart_of_account_id: b.chart_of_account_id,
      dre_product_id: b.dre_product_id,
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
    if (closedPeriods.some((p) => p.company_id === form.company_id && p.period === competencyMonth)) {
      setErro('Período ' + competencyMonth + ' está fechado. Reabra o período antes de lançar.')
      setSalvando(false)
      return
    }
    // trava de integridade: sem conta do plano, o lançamento SOME da DRE (o JOIN o engole).
    if (!form.chart_of_account_id) {
      setErro('Escolha a "Conta contábil" — ela define se o lançamento entra na DRE ou no patrimônio.')
      setSalvando(false)
      return
    }
    if (!contaContabilSelecionada || !contaDisponivelParaEmpresa(contaContabilSelecionada, form.company_id)) {
      setErro('A conta contábil escolhida não pertence à empresa do lançamento nem é compartilhada.')
      setSalvando(false)
      return
    }
    if (!contaCompativelComLancamento(contaContabilSelecionada, tipo)) {
      setErro(`A conta "${rotuloContaContabil(contaContabilSelecionada)}" é incompatível com ${tipo === 'payable' ? 'uma conta a pagar' : 'uma conta a receber'} e faria o lançamento desaparecer da DRE.`)
      setSalvando(false)
      return
    }
    if (tributoMencionado && contaContabilSelecionada.tipo === 'resultado' && contaContabilSelecionada.nature !== 'deduction') {
      setErro(`${tributoMencionado} precisa ser classificado em uma conta de natureza "Dedução". Para tratamento exclusivamente patrimonial, escolha conscientemente uma conta patrimonial.`)
      setSalvando(false)
      return
    }
    if (!form.issue_date) {
      setErro('Informe a "Data de emissão" — campo obrigatório.')
      setSalvando(false)
      return
    }
    if (!form.competency_date) {
      setErro('Informe a "Data de Competência" — campo obrigatório.')
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
      dre_product_id: contaContabilSelecionada.tipo === 'resultado' ? (form.dre_product_id || null) : null,
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
        issue_date: payload.issue_date ?? payload.due_date,
        competency_date: payload.competency_date,
        due_date: payload.due_date,
        chart_of_account_id: payload.chart_of_account_id,
        dre_product_id: payload.dre_product_id,
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
        issue_date: l.issue_date ?? l.due_date,
        competency_date: l.competency_date ?? l.issue_date ?? l.due_date,
        due_date: l.due_date,
        chart_of_account_id: l.chart_of_account_id ?? null,
        dre_product_id: l.dre_product_id ?? null,
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
    // a origem pode ter ficado "fantasma": escolhida no Consolidado, modal fechado sem salvar,
    // empresa trocada — o select não a mostra mais, mas o form ainda guarda o id
    if (empresaAtiva && origem.company_id !== empresaAtiva.id) {
      setErro('A conta de origem não é da empresa selecionada. Escolha a origem de novo.')
      setTransferForm((f) => ({ ...f, origem: '' }))
      return
    }
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
    const idx = mapearColunasImportacao(importHeaders)
    if (idx.description === undefined || idx.amount === undefined || idx.due_date === undefined || idx.competency_date === undefined || idx.chart_of_account === undefined) {
      setImportErro('Colunas obrigatórias não encontradas. Use: Descrição, Valor, Vencimento, Competência e Conta contábil.')
      setImportando(false)
      return
    }
    // em "Consolidado" (sem empresa ativa) o import iria pra empresas[0] arbitrariamente — bloqueia
    // e exige escolher a empresa no seletor global (mesmo padrao do Hotmart).
    const cid = empresaAtiva?.id ?? ''
    if (!cid) {
      setImportErro('Selecione uma empresa no seletor do topo antes de importar (não dá pra importar em "Consolidado").')
      setImportando(false)
      return
    }
    // conta casada por nome: prioriza a da empresa do import (há homônimas entre empresas —
    // ex. a conta espelho "CONTA SICOOB - RB7 DIGITAL"); só cai no universo todo se não houver
    // na empresa (preserva intercompany intencional por nome exato)
    const contaByName = (name: string) => {
      const casa = (c: Account) => normalizarTexto(c.name) === normalizarTexto(name)
      return (contas.filter((c) => c.company_id === cid).find(casa) ?? contas.find(casa))?.id ?? null
    }
    const contasDoEscopo = chartAccounts
      .filter((conta) => contaDisponivelParaEmpresa(conta, cid) && contaCompativelComLancamento(conta, tipo))
      .sort((a, b) => Number(b.company_id === cid) - Number(a.company_id === cid))
    const contaContabilByRef = (referencia: string) => {
      const ref = normalizarTexto(referencia)
      return contasDoEscopo.find((conta) =>
        normalizarTexto(conta.code) === ref ||
        normalizarTexto(conta.name) === ref ||
        normalizarTexto(`${conta.code} - ${conta.name}`) === ref ||
        normalizarTexto(`${conta.code} – ${conta.name}`) === ref
      )
    }

    const payload: Record<string, unknown>[] = []
    const erros: string[] = []
    importLinhas.forEach((r, index) => {
      const description = r[idx.description!]?.trim()
      if (!description) return
      const amount = parseValorPlanilha(r[idx.amount!] ?? '')
      const dueDate = parseDataPlanilha(r[idx.due_date!] ?? '')
      const competencyDate = parseDataPlanilha(r[idx.competency_date!] ?? '')
      const issueRaw = idx.issue_date !== undefined ? r[idx.issue_date] ?? '' : ''
      const issueDate = issueRaw.trim() ? parseDataPlanilha(issueRaw) : competencyDate
      const contaContabilRef = r[idx.chart_of_account!] ?? ''
      const contaContabil = contaContabilByRef(contaContabilRef)
      const problemas: string[] = []
      if (amount <= 0) problemas.push('Valor deve ser maior que zero')
      if (!dueDate) problemas.push('Vencimento inválido')
      if (!competencyDate) problemas.push('Competência inválida')
      if (issueRaw.trim() && !issueDate) problemas.push('Emissão inválida')
      if (!contaContabil) problemas.push(`Conta contábil "${contaContabilRef || 'vazia'}" não encontrada ou incompatível`)
      const tributo = tributoSobreVendaMencionado(description)
      if (tributo && contaContabil?.tipo === 'resultado' && contaContabil.nature !== 'deduction') {
        problemas.push(`${tributo} deve usar uma conta de resultado com natureza Dedução ou uma conta patrimonial explicitamente escolhida`)
      }
      if (problemas.length) {
        erros.push(`Linha ${index + 2}: ${problemas.join('; ')}`)
        return
      }
      payload.push({
        company_id: cid,
        type: tipo,
        description,
        amount,
        due_date: dueDate,
        competency_date: competencyDate,
        chart_of_account_id: contaContabil!.id,
        interest_amount: idx.interest !== undefined ? parseValorPlanilha(r[idx.interest] ?? '') : 0,
        fine_amount: idx.fine !== undefined ? parseValorPlanilha(r[idx.fine] ?? '') : 0,
        discount_amount: idx.discount !== undefined ? parseValorPlanilha(r[idx.discount] ?? '') : 0,
        issue_date: issueDate,
        counterparty: idx.counterparty !== undefined ? r[idx.counterparty]?.trim() || null : null,
        account_id: idx.account !== undefined ? contaByName(r[idx.account] ?? '') : null,
        notes: idx.notes !== undefined ? r[idx.notes]?.trim() || null : null,
        status: (idx.status !== undefined ? STATUS_MAP[normalizarTexto(r[idx.status] ?? '')] : undefined) ?? ('to_pay' as EntryStatus),
        is_recurring: idx.recurring !== undefined
          ? ['sim', 'yes', 'true', '1', 'x'].includes(normalizarTexto(r[idx.recurring] ?? ''))
          : false,
        created_by: session?.user.id ?? null,
      })
    })
    if (erros.length > 0) {
      setImportErro(`Corrija a planilha antes de importar:\n${erros.slice(0, 8).join('\n')}${erros.length > 8 ? `\n… e mais ${erros.length - 8} linha(s).` : ''}`)
      setImportando(false)
      return
    }
    if (payload.length === 0) {
      setImportErro('Nenhuma linha preenchida para importar.')
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
    const cols = ['Descrição', 'Valor', 'Vencimento', 'Competência', 'Conta contábil', 'Emissão', ehPagar ? 'Fornecedor' : 'Cliente', 'Conta', 'Observações', 'Recorrente', 'Juros', 'Multa', 'Desconto']
    const ex = ['Aluguel escritório', '2500,00', '2026-07-10', '2026-07-01', '6.3.01', '2026-07-01', 'João Imóveis', 'Conta Corrente', 'Mensalidade', 'sim', '', '', '']
    const csv = [cols.join(';'), ex.join(';')].join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `modelo_${ehPagar ? 'pagar' : 'receber'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [tipo])

  const importColIdx = useMemo(() => mapearColunasImportacao(importHeaders), [importHeaders])
  const importValidas = useMemo(
    () => importLinhas.filter(r => r[importColIdx.description ?? -1]?.trim()).length,
    [importLinhas, importColIdx]
  )

  // busca textual (descrição/contraparte) aplicada no cliente — instantânea e
  // sem nova requisição por tecla (entries é uma tabela pequena)
  const lancamentosExibidos = useMemo(() => {
    const q = normalizarTexto(busca) // ignora acento/caixa, igual ao fluxo de import
    if (!q) return lancamentos
    return lancamentos.filter((l) =>
      normalizarTexto(l.description).includes(q) || normalizarTexto(l.counterparty ?? '').includes(q)
    )
  }, [lancamentos, busca])

  // os 3 KPIs usam o valor EFETIVO (com juros/multa/desconto), a mesma régua da
  // coluna "A pagar" da tabela: A pagar + Pendente + Pago = rodapé da coluna.
  // "Pago" é o caixa que de fato moveu.
  const totais = useMemo(() => ({
    aPagar: lancamentosExibidos.filter((l) => l.status === 'to_pay' && !l.transfer_id).reduce((s, l) => s + valorEfetivo(l), 0),
    pendente: lancamentosExibidos.filter((l) => l.status === 'pending' && !l.transfer_id).reduce((s, l) => s + valorEfetivo(l), 0),
    pago: lancamentosExibidos.filter((l) => l.status === 'paid' && !l.transfer_id).reduce((s, l) => s + valorEfetivo(l), 0),
  }), [lancamentosExibidos])

  // intercompany: lançamento cuja conta pagadora é de OUTRA empresa (empresa A paga
  // conta de B). É legítimo por design (decisão do Luiz 2026-06-30) — só sinaliza, não bloqueia.
  const intercompany = useMemo(
    () => lancamentosExibidos.filter((l) => l.account && l.account.company_id !== l.company_id),
    [lancamentosExibidos]
  )

  // incompletos: sem conta contábil e/ou sem Data de emissão (campos
  // obrigatórios no form novo, mas lançamentos antigos/importados podem faltar) —
  // transferência é neutra por design, não entra aqui.
  const incompletos = useMemo(
    () => lancamentosExibidos.filter((l) => !l.transfer_id && (!l.chart_of_account_id || !l.issue_date)),
    [lancamentosExibidos]
  )

  // total da coluna Valor (rodapé da tabela): soma o valor ORIGINAL (sem juros/
  // multa/desconto), excluindo cancelados (anulados não contam), exceto quando o
  // filtro é justamente "Cancelado". Quem concilia com os cards é a coluna
  // "A pagar/A receber" (valor efetivo) — este rodapé diverge dos cards quando
  // há encargo/desconto lançado.
  const totalValor = useMemo(
    () => lancamentosExibidos
      .filter((l) => (filtroStatus === 'cancelled' || l.status !== 'cancelled') && !l.transfer_id)
      .reduce((s, l) => s + Number(l.amount), 0),
    [lancamentosExibidos, filtroStatus]
  )

  // total da coluna "A pagar/A receber": soma do valor efetivo de tudo que move
  // dinheiro (sem transferência nem cancelado) — concilia com os cards:
  // A pagar + Pendente + Pago (estornados ficam fora dos cards, mas entram aqui).
  const totalAPagar = useMemo(
    () => lancamentosExibidos
      .filter((l) => l.status !== 'cancelled' && !l.transfer_id)
      .reduce((s, l) => s + valorEfetivo(l), 0),
    [lancamentosExibidos]
  )

  // se o filtro de empresa coincide com o escopo global, trata como "sem filtro"
  // (a empresa ativa é omitida das opções — evita o select renderizar em branco)
  const filtroEmpresaVisivel = filtroEmpresa && filtroEmpresa !== empresaAtiva?.id ? filtroEmpresa : ''
  const temFiltro = !!(busca || filtroStatus || filtroConta || filtroEmpresaVisivel || dataDe || dataAte || emissaoDe || emissaoAte)
  const limparFiltros = () => {
    setBusca('')
    setFiltroStatus('')
    setFiltroConta('')
    setFiltroEmpresa('')
    setDataDe('')
    setDataAte('')
    setEmissaoDe('')
    setEmissaoAte('')
  }

  const ehPagar = tipo === 'payable'

  // ── seleção em massa (só conta os marcados que estão VISÍVEIS; respeita filtro/busca) ──
  const idsVisiveis = new Set(lancamentosExibidos.map((l) => l.id))
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id] && idsVisiveis.has(id))
  const selectedEntries = lancamentosExibidos.filter((l) => rowSelection[l.id])
  const contasEmMassa = chartAccounts.filter((conta) => selectedEntries.filter((entry) => !entry.transfer_id).every((entry) =>
    contaDisponivelParaEmpresa(conta, entry.company_id) && contaCompativelComLancamento(conta, entry.type)
  ))

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
            issue_date: l.issue_date ?? l.due_date,
            competency_date: l.competency_date ?? l.issue_date ?? l.due_date,
            due_date: l.due_date,
            chart_of_account_id: l.chart_of_account_id ?? null,
            dre_product_id: l.dre_product_id ?? null,
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
    const contasDeOutraEmpresa = selectedEntries.filter((entry) =>
      entry.chart_of_account?.company_id && entry.chart_of_account.company_id !== companyId
    )
    if (contasDeOutraEmpresa.length > 0) {
      setErro(`${contasDeOutraEmpresa.length} lançamento(s) usam conta contábil específica de outra empresa. Reclassifique-os antes de mover.`)
      return
    }
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

  // classificar em massa: atribui a Conta do Plano (chart_of_account) aos selecionados — a ferramenta
  // pra esvaziar o balde "(A classificar)" do DRE (as despesas nao-classificadas passam a entrar na conta).
  const aplicarContaEmMassa = async (chartId: string) => {
    if (selectedIds.length === 0 || !chartId) return
    const conta = chartAccounts.find((c) => c.id === chartId)
    // transferências não recebem conta do plano (são neutras na DRE) — pula as pernas selecionadas
    const transferIds = new Set(lancamentos.filter((l) => l.transfer_id).map((l) => l.id))
    const alvos = selectedIds.filter((id) => !transferIds.has(id))
    const pulados = selectedIds.length - alvos.length
    if (alvos.length === 0) { setErro('Só transferências selecionadas — elas não recebem Conta do Plano (são neutras na DRE).'); return }
    const entriesAlvo = selectedEntries.filter((entry) => alvos.includes(entry.id))
    if (!conta || entriesAlvo.some((entry) =>
      !contaDisponivelParaEmpresa(conta, entry.company_id) || !contaCompativelComLancamento(conta, entry.type)
    )) {
      setErro('A conta contábil escolhida não é compatível com todos os lançamentos selecionados.')
      return
    }
    const n = alvos.length
    if (!(await confirmar({ titulo: 'Classificar em massa', mensagem: `Atribuir a conta "${conta?.code} – ${conta?.name}" a ${n} ${n === 1 ? 'lançamento' : 'lançamentos'}?` + (pulados > 0 ? ` (${pulados} transferência(s) serão puladas)` : '') }))) return
    const { error } = await supabase.from('entries').update({
      chart_of_account_id: chartId,
      ...(conta.tipo === 'patrimonial' ? { dre_product_id: null } : {}),
    }).in('id', alvos)
    if (error) { setErro('Erro ao classificar em massa: ' + error.message); return }
    setRowSelection({})
    toast(`${n} ${n === 1 ? 'lançamento classificado' : 'lançamentos classificados'} em ${conta?.code ?? 'conta'}` + (pulados > 0 ? ` · ${pulados} transferência(s) puladas` : ''))
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
    { id: 'chart_of_account', header: 'Conta contábil', size: 180, cell: (l) =>
      l.chart_of_account
        ? <span className="text-xs text-fg-muted font-mono">{l.chart_of_account.code} – {l.chart_of_account.name}{l.chart_of_account.tipo === 'patrimonial' ? ' · Patrimonial' : ''}</span>
        : <span className="text-fg-subtle">—</span>
    },
    { id: 'issue_date', header: 'Emissão', size: 110, cell: (l) => <span className="text-fg-muted tnum">{fmtData(l.issue_date)}</span> },
    { id: 'due_date', header: 'Vencimento', size: 110, cell: (l) => <span className="text-fg-muted tnum">{fmtData(l.due_date)}</span> },
    { id: 'payment_date', header: 'Pagamento', size: 110, cell: (l) => <span className="text-fg-muted tnum">{fmtData(l.payment_date)}</span> },
    // valor original (de face); o valor real com encargos/desconto fica na
    // coluna "A pagar/A receber" (a sub-linha "pago R$" foi removida a pedido
    // do Luiz, 2026-07-06 — a coluna nova carrega essa informação).
    { id: 'amount', header: 'Valor', size: 120, align: 'right', cell: (l) =>
      <span className="font-semibold tnum">{fmtBRL(Number(l.amount))}</span>,
      footer: fmtBRL(totalValor) },
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
    // o valor REAL da conta (valor + juros + multa − desconto) — o que se paga/
    // recebe de fato, esteja paga ou não (a situação é a coluna Status; decisão
    // do Luiz 2026-07-06, ele quer VER o líquido em toda linha). Cancelado e
    // transferência não movem dinheiro → "—".
    { id: 'a_pagar',
      header: (
        <span title={`Valor real da conta: valor + juros + multa − desconto (o que se ${ehPagar ? 'paga' : 'recebe'} de fato)`}>
          {ehPagar ? 'A pagar' : 'A receber'}
        </span>
      ),
      label: ehPagar ? 'A pagar' : 'A receber',
      size: 120, align: 'right',
      cell: (l) =>
        l.transfer_id || l.status === 'cancelled'
          ? <span className="text-fg-subtle">—</span>
          : <span className={`font-semibold tnum ${ehPagar ? 'text-expense' : 'text-revenue'}`}>{fmtBRL(valorEfetivo(l))}</span>,
      footer: fmtBRL(totalAPagar) },
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
        {isAdmin && !l.transfer_id && (
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
  ], [isAdmin, ehPagar, tipo, totalValor, totalAPagar, empresas, enviarParaPagamento, marcarPago, abrirEdicao, excluir])

  // Exporta os lançamentos EXIBIDOS (respeita filtros + busca) — reusa o helper de relatório.
  const exportar = (formato: 'xlsx' | 'csv') => {
    const statusLabel = (s: string) => (({
      to_pay: ehPagar ? 'A pagar' : 'A receber', pending: 'Pendente',
      paid: ehPagar ? 'Pago' : 'Recebido', cancelled: 'Cancelado', refunded: 'Estornado',
    }) as Record<string, string>)[s] ?? s
    const header = ['Descrição', 'Contraparte', 'Empresa', 'Conta do Plano', 'Produto DRE', 'Emissão', 'Vencimento', 'Pagamento', 'Valor', 'Juros', 'Multa', 'Desconto', ehPagar ? 'A Pagar' : 'A Receber', 'Status']
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
      l.transfer_id || l.status === 'cancelled' ? '' : valorEfetivo(l),
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

      {truncado && (
        <div className="mb-4">
          <Alert tom="warning">
            Mostrando só as primeiras <span className="font-semibold text-fg">1000</span> linhas (teto do banco).
            Refine por empresa, status ou período para ver o restante — totais e exportação também se limitam ao que está carregado.
          </Alert>
        </div>
      )}

      {intercompany.length > 0 && (
        <div className="mb-4">
          <Alert tom="info">
            {intercompany.length} {intercompany.length === 1 ? 'lançamento é' : 'lançamentos são'} intercompany
            {' '}({fmtBRL(intercompany.reduce((s, l) => s + Number(l.amount), 0))}) — pagos pela conta de outra empresa.
            É legítimo por design; a coluna Empresa marca cada um.
          </Alert>
        </div>
      )}

      {incompletos.length > 0 && (
        <div className="mb-4">
          <Alert tom="warning">
            {incompletos.length} {incompletos.length === 1 ? 'lançamento está' : 'lançamentos estão'} sem conta contábil e/ou Data de emissão
            {' '}({fmtBRL(incompletos.reduce((s, l) => s + Number(l.amount), 0))}) — complete os dois campos para manter DRE e patrimônio íntegros.
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
          <div>
            <label className="block text-sm font-medium mb-1">Emissão</label>
            <DateRangePicker de={emissaoDe} ate={emissaoAte} onChange={(d, a) => { setEmissaoDe(d); setEmissaoAte(a) }} />
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
          <div className="w-44">
            <label className="block text-sm font-medium mb-1">Conta contábil</label>
            <select className={inputCls} value={filtroConta} onChange={(e) => setFiltroConta(e.target.value as '' | 'sem' | 'com')}>
              <option value="">Todas</option>
              <option value="sem">Sem conta (a classificar)</option>
              <option value="com">Com conta</option>
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
          <div className="flex items-center gap-2">
            <span className="text-sm text-fg-muted">Conta contábil:</span>
            <select
              value=""
              onChange={(e) => { const v = e.target.value; if (v) aplicarContaEmMassa(v) }}
              className="rounded-control border border-border-strong px-2 py-1.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand max-w-[16rem]"
            >
              <option value="" disabled>Classificar…</option>
              {contasEmMassa.map((c) => <option key={c.id} value={c.id}>{rotuloContaContabil(c)}</option>)}
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
                <select required className={inputCls} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value, account_id: '', chart_of_account_id: '', dre_product_id: '' })}>
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
              <label className="block text-sm font-medium mb-1">Data de emissão *</label>
              <input type="date" required className={inputCls} value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data de Competência *</label>
              <input type="date" required className={inputCls} value={form.competency_date} onChange={(e) => setForm({ ...form, competency_date: e.target.value })} />
              <p className="text-xs text-fg-subtle mt-0.5">Usada na DRE por competência.</p>
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
              <label htmlFor="tratamento-contabil" className="block text-sm font-medium mb-1">Tratamento contábil <span className="text-expense">*</span></label>
              <select
                id="tratamento-contabil"
                className={inputCls}
                value={form.chart_of_account_id}
                onChange={(e) => {
                  const escolhida = chartAccounts.find((conta) => conta.id === e.target.value)
                  setForm({ ...form, chart_of_account_id: e.target.value, dre_product_id: escolhida?.tipo === 'patrimonial' ? '' : form.dre_product_id })
                }}
              >
                <option value="">— Escolha a conta contábil —</option>
                {contasResultadoDisponiveis.length > 0 && (
                  <optgroup label="Resultado — entra na DRE">
                    {contasResultadoDisponiveis.map((c) => <option key={c.id} value={c.id}>{rotuloContaContabil(c)}</option>)}
                  </optgroup>
                )}
                {contasPatrimoniaisDisponiveis.length > 0 && (
                  <optgroup label="Patrimonial — não entra na DRE">
                    {contasPatrimoniaisDisponiveis.map((c) => <option key={c.id} value={c.id}>{rotuloContaContabil(c)}</option>)}
                  </optgroup>
                )}
              </select>
              <p className="text-xs text-fg-subtle mt-1">
                Use Patrimonial para consórcios, imobilizado, empréstimos e outros movimentos que não são resultado operacional.
              </p>
              {tributoMencionado && contaContabilSelecionada?.tipo === 'resultado' && contaContabilSelecionada.nature !== 'deduction' && (
                <p className="text-xs text-warning mt-1 font-medium">
                  Atenção: {tributoMencionado} deve normalmente ser classificado em Deduções da DRE. Revise a conta escolhida.
                </p>
              )}
              {contaContabilSelecionada?.tipo === 'patrimonial' && normalizarTexto(contaContabilSelecionada.name).includes('consorcio') && (
                <p className="text-xs text-warning mt-1 font-medium">
                  Se a parcela tiver taxa administrativa, seguro ou outra despesa, lance essa parte separadamente em uma conta de resultado. Aqui deve ficar somente fundo/reserva patrimonial.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Produto / Centro de Custo</label>
              <select disabled={contaContabilSelecionada?.tipo === 'patrimonial'} className={inputCls} value={form.dre_product_id} onChange={(e) => setForm({ ...form, dre_product_id: e.target.value })}>
                <option value="">— Herdar da conta do Plano —</option>
                {/* produtos são por empresa (2026-07-19); company_id null = legado, ainda vale em todas */}
                {dreProducts.filter((p) => p.company_id === null || p.company_id === form.company_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-xs text-fg-subtle mt-1">{contaContabilSelecionada?.tipo === 'patrimonial' ? 'Não se aplica a contas patrimoniais.' : 'Vazio = usa o produto vinculado à conta acima (na DRE por Produto). Escolha aqui só pra sobrepor.'}</p>
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
              {/* origem respeita a empresa ativa; o DESTINO fica com todas (transferência
                  intercompany é suportada por design — cada perna nasce na empresa da conta) */}
              <select className={inputCls} value={transferForm.origem} onChange={(e) => setTransferForm({ ...transferForm, origem: e.target.value })}>
                <option value="">Selecione…</option>
                {contas.filter((c) => !empresaAtiva || c.company_id === empresaAtiva.id).map((c) => (
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
            <p><span className="font-medium text-fg">Obrigatórias:</span> Descrição · Valor · Vencimento · Competência · Conta contábil</p>
            <p><span className="font-medium text-fg">Opcionais:</span> Emissão · {ehPagar ? 'Fornecedor' : 'Cliente'} · Conta bancária · Observações · Status · Recorrente · Juros · Multa · Desconto</p>
            <p className="mt-1"><span className="font-medium text-fg">Conta contábil:</span> informe o código ou o nome exato. Contas incompatíveis com pagar/receber são bloqueadas.</p>
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
          {importErro && <p className="text-sm text-expense whitespace-pre-line">{importErro}</p>}
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
