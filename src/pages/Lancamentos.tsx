import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Plus, Pencil, CheckCircle2, Trash2, ArrowRight, Repeat, Upload, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, fmtData, hoje } from '../lib/format'
import { corDaCategoria } from '../lib/fatura'
import type { Account, Category, Entry, EntryType, EntryStatus } from '../lib/types'
import { Card, PageHeader, StatusBadge, Badge, Vazio, Modal, ErroBanner, inputCls, btnPrimario, btnSecundario } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'
import type { RowSelectionState } from '@tanstack/react-table'
import DateRangePicker from '../components/DateRangePicker'

// Etapa 4 — Contas a Pagar/Receber. Port do Lancamentos.tsx do rb7 adaptado
// pro schema EN (tabela `entries`). Adaptações vs a fonte:
//  - `lancamentos`→`entries` e todas as colunas PT→EN; enums EN.
//  - categoria referencia a tabela VIVA `categories` (color_index, sem
//    dimensão pagar/receber); ambos os tipos compartilham a mesma lista —
//    decisão mantida pela Fase 3.
//  - embed de accounts precisa do hint !account_id (entries tem 2 FKs pra
//    accounts: account_id e invoice_account_id → PGRST201 sem o hint).
//  - erros aparecem em banner (o rb7 também engolia).

interface FormState {
  id?: string
  company_id: string
  account_id: string
  category_id: string
  description: string
  amount: string
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
  category_id: '',
  description: '',
  amount: '',
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
    if (['categoria', 'category'].includes(k)) idx.category = i
    if (['conta', 'account'].includes(k)) idx.account = i
    if (['observacoes', 'notes', 'obs'].includes(k)) idx.notes = i
    if (['status'].includes(k)) idx.status = i
    if (['recorrente', 'recurring'].includes(k)) idx.recurring = i
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

const STATUS_MAP: Record<string, EntryStatus> = {
  'a pagar': 'to_pay', 'a receber': 'to_pay', 'to_pay': 'to_pay',
  'pendente': 'pending', 'pending': 'pending',
  'pago': 'paid', 'recebido': 'paid', 'paid': 'paid',
  'cancelado': 'cancelled', 'cancelled': 'cancelled',
}

export default function Lancamentos({ tipo }: { tipo: EntryType }) {
  const { empresas, empresaAtiva, session, isAdmin } = useApp()
  const [lancamentos, setLancamentos] = useState<Entry[]>([])
  const [categorias, setCategorias] = useState<Category[]>([])
  const [contas, setContas] = useState<Account[]>([])
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState<FormState>(formVazio(''))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // import
  const [importAberto, setImportAberto] = useState(false)
  const [importLinhas, setImportLinhas] = useState<string[][]>([])
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importErro, setImportErro] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    let q = supabase
      .from('entries')
      .select('*, category:categories(*), account:accounts!account_id(*)')
      .eq('type', tipo)
      .order('due_date')
    // empresa: filtro local da tela tem precedência sobre o escopo global
    const escopoEmpresa = filtroEmpresa || empresaAtiva?.id
    if (escopoEmpresa) q = q.eq('company_id', escopoEmpresa)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    if (filtroCategoria === '__none__') q = q.is('category_id', null)
    else if (filtroCategoria) q = q.eq('category_id', filtroCategoria)
    if (dataDe) q = q.gte('due_date', dataDe)
    if (dataAte) q = q.lte('due_date', dataAte)
    const { data, error } = await q
    if (error) { setErro('Erro ao carregar lançamentos: ' + error.message); return }
    setLancamentos((data as Entry[]) ?? [])
  }, [tipo, empresaAtiva, filtroStatus, filtroCategoria, filtroEmpresa, dataDe, dataAte])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    // categorias vivas (compartilhadas entre pagar/receber, por design)
    supabase.from('categories').select('*').order('name').then(({ data }) => setCategorias(data ?? []))
    supabase.from('accounts').select('*').eq('active', true).order('name').then(({ data }) => setContas(data ?? []))
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
      category_id: l.category_id ?? '',
      description: l.description,
      amount: String(l.amount),
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
  // categoria, conta; vencimento +1 mês; status inicial "a pagar")
  const inserirProximoMes = useCallback(async (b: {
    company_id: string; account_id: string | null; category_id: string | null
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
      category_id: b.category_id,
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
      category_id: form.category_id || null,
      type: tipo,
      description: form.description,
      amount: parseFloat(form.amount.replace(',', '.')),
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
        category_id: payload.category_id,
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
        category_id: l.category_id ?? null,
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
    carregar()
  }, [carregar, inserirProximoMes])

  const excluir = useCallback(async (l: Entry) => {
    if (!window.confirm(`Excluir "${l.description}"?`)) return
    const { error } = await supabase.from('entries').delete().eq('id', l.id)
    if (error) { setErro('Erro ao excluir lançamento: ' + error.message); return }
    carregar()
  }, [carregar])

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
    const catByName = (name: string) => categorias.find(c => normalizar(c.name) === normalizar(name))?.id ?? null
    const contaByName = (name: string) => contas.find(c => normalizar(c.name) === normalizar(name))?.id ?? null
    const cid = empresaAtiva?.id ?? empresas[0]?.id ?? ''
    const payload = importLinhas
      .filter(r => r[idx.description]?.trim())
      .map(r => ({
        company_id: cid,
        type: tipo,
        description: r[idx.description].trim(),
        amount: parseValor(r[idx.amount] ?? ''),
        due_date: parseData(r[idx.due_date] ?? ''),
        issue_date: idx.issue_date !== undefined ? parseData(r[idx.issue_date] ?? '') || null : null,
        counterparty: idx.counterparty !== undefined ? r[idx.counterparty]?.trim() || null : null,
        category_id: idx.category !== undefined ? catByName(r[idx.category] ?? '') : null,
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
    const cols = ['Descrição', 'Valor', 'Vencimento', 'Emissão', ehPagar ? 'Fornecedor' : 'Cliente', 'Categoria', 'Conta', 'Observações', 'Recorrente']
    const ex = ['Aluguel escritório', '2500,00', '2026-07-10', '2026-07-01', 'João Imóveis', 'Despesas Fixas', 'Conta Corrente', 'Mensalidade', 'sim']
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
    aPagar: lancamentosExibidos.filter((l) => l.status === 'to_pay').reduce((s, l) => s + Number(l.amount), 0),
    pendente: lancamentosExibidos.filter((l) => l.status === 'pending').reduce((s, l) => s + Number(l.amount), 0),
    pago: lancamentosExibidos.filter((l) => l.status === 'paid').reduce((s, l) => s + Number(l.amount), 0),
  }), [lancamentosExibidos])

  // total da coluna Valor (rodapé da tabela): exclui cancelados (anulados não
  // contam), exceto quando o filtro é justamente "Cancelado" — assim o rodapé
  // concilia com os cards (A pagar + Pendente + Pago)
  const totalValor = useMemo(
    () => lancamentosExibidos
      .filter((l) => filtroStatus === 'cancelled' || l.status !== 'cancelled')
      .reduce((s, l) => s + Number(l.amount), 0),
    [lancamentosExibidos, filtroStatus]
  )

  // se o filtro de empresa coincide com o escopo global, trata como "sem filtro"
  // (a empresa ativa é omitida das opções — evita o select renderizar em branco)
  const filtroEmpresaVisivel = filtroEmpresa && filtroEmpresa !== empresaAtiva?.id ? filtroEmpresa : ''
  const temFiltro = !!(busca || filtroStatus || filtroCategoria || filtroEmpresaVisivel || dataDe || dataAte)
  const limparFiltros = () => {
    setBusca('')
    setFiltroStatus('')
    setFiltroCategoria('')
    setFiltroEmpresa('')
    setDataDe('')
    setDataAte('')
  }

  const ehPagar = tipo === 'payable'

  // ── seleção em massa (só conta os marcados que estão VISÍVEIS; respeita filtro/busca) ──
  const idsVisiveis = new Set(lancamentosExibidos.map((l) => l.id))
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id] && idsVisiveis.has(id))
  const selectedEntries = lancamentosExibidos.filter((l) => rowSelection[l.id])

  const aplicarCategoriaEmMassa = async (categoryId: string | null) => {
    if (selectedIds.length === 0) return
    const { error } = await supabase.from('entries').update({ category_id: categoryId }).in('id', selectedIds)
    if (error) { setErro('Erro ao alterar categorias em massa: ' + error.message); return }
    setRowSelection({})
    carregar()
  }

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
      if (!window.confirm(aviso)) return
      const { error } = await supabase.from('entries').update({ status: 'paid', payment_date: hoje() }).in('id', selectedIds)
      if (error) { setErro('Erro ao marcar como pago em massa: ' + error.message); return }
      const errs = await Promise.all(
        recorrentes.map((l) =>
          inserirProximoMes({
            company_id: l.company_id,
            account_id: l.account_id ?? null,
            category_id: l.category_id ?? null,
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
    carregar()
  }

  const colunas = useMemo<DataColumn<Entry>[]>(() => [
    { id: 'description', header: 'Descrição', size: 240, cell: (l) => (
      <div>
        <p className="font-medium text-slate-800 flex items-center gap-1">
          {l.description}
          {l.is_recurring && <span title="Recorrente"><Repeat size={13} className="text-indigo-400 shrink-0" /></span>}
        </p>
        {l.counterparty && <p className="text-xs text-slate-400">{l.counterparty}</p>}
      </div>
    ), footer: 'Total' },
    { id: 'category', header: 'Categoria', size: 150, cell: (l) => (l.category ? <Badge cor={corDaCategoria(l.category.color_index).text}>{l.category.name}</Badge> : '—') },
    { id: 'issue_date', header: 'Emissão', size: 110, cell: (l) => <span className="text-slate-600">{fmtData(l.issue_date)}</span> },
    { id: 'due_date', header: 'Vencimento', size: 110, cell: (l) => <span className="text-slate-600">{fmtData(l.due_date)}</span> },
    { id: 'payment_date', header: 'Pagamento', size: 110, cell: (l) => <span className="text-slate-600">{fmtData(l.payment_date)}</span> },
    { id: 'amount', header: 'Valor', size: 120, align: 'right', cell: (l) => <span className="font-semibold">{fmtBRL(Number(l.amount))}</span>, footer: fmtBRL(totalValor) },
    { id: 'status', header: 'Status', size: 130, cell: (l) => <StatusBadge status={l.status} tipo={tipo} /> },
    { id: 'acoes', header: '', label: 'Ações', size: 120, align: 'right', enableHiding: false, cell: (l) => (
      <div className="flex gap-2 justify-end">
        {isAdmin && l.status === 'to_pay' && (
          <button title="Enviar para pagamento" onClick={() => enviarParaPagamento(l)} className="text-blue-500 hover:text-blue-700">
            <ArrowRight size={17} />
          </button>
        )}
        {isAdmin && l.status === 'pending' && (
          <button title={ehPagar ? 'Marcar como pago' : 'Marcar como recebido'} onClick={() => marcarPago(l)} className="text-green-600 hover:text-green-800">
            <CheckCircle2 size={17} />
          </button>
        )}
        {isAdmin && (
          <button title="Editar" onClick={() => abrirEdicao(l)} className="text-slate-400 hover:text-indigo-600">
            <Pencil size={16} />
          </button>
        )}
        {isAdmin && (
          <button title="Excluir" onClick={() => excluir(l)} className="text-slate-400 hover:text-red-600">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    ) },
  ], [isAdmin, ehPagar, tipo, totalValor, enviarParaPagamento, marcarPago, abrirEdicao, excluir])

  return (
    <div>
      <PageHeader
        titulo={ehPagar ? 'Contas a Pagar' : 'Contas a Receber'}
        subtitulo="Fluxo: Emissão → Vencimento → Pagamento"
        acao={
          isAdmin ? (
            <div className="flex gap-2">
              <button onClick={() => setImportAberto(true)} className={btnSecundario}>
                <Upload size={16} /> Importar
              </button>
              <button onClick={abrirNovo} className={btnPrimario}>
                <Plus size={16} /> Novo lançamento
              </button>
            </div>
          ) : undefined
        }
      />

      <ErroBanner mensagem={erro} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">{ehPagar ? 'A pagar' : 'A receber'}</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{fmtBRL(totais.aPagar)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Pendente</p>
          <p className="text-xl font-bold text-amber-600 mt-1">{fmtBRL(totais.pendente)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">{ehPagar ? 'Pago' : 'Recebido'}</p>
          <p className="text-xl font-bold text-green-600 mt-1">{fmtBRL(totais.pago)}</p>
        </Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-64">
            <label className="block text-sm font-medium mb-1">Buscar</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
          <div className="w-48">
            <label className="block text-sm font-medium mb-1">Categoria</label>
            <select className={inputCls} value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="">Todas as categorias</option>
              <option value="__none__">Sem categoria</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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
            <button type="button" onClick={limparFiltros} className="text-sm text-slate-500 hover:text-red-600 underline pb-2">
              Limpar filtros
            </button>
          )}
        </div>
      </Card>

      {isAdmin && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl border border-indigo-200 bg-indigo-50 flex-wrap">
          <span className="text-sm font-semibold text-indigo-800 whitespace-nowrap">
            {selectedIds.length} selecionado{selectedIds.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Categoria:</span>
            <select
              value=""
              onChange={(e) => { const v = e.target.value; if (v) aplicarCategoriaEmMassa(v === '__none__' ? null : v) }}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="" disabled>Escolher…</option>
              <option value="__none__">Sem categoria</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Status:</span>
            <select
              value=""
              onChange={(e) => { const v = e.target.value as EntryStatus | ''; if (v) aplicarStatusEmMassa(v) }}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="" disabled>Escolher…</option>
              <option value="to_pay">{ehPagar ? 'A pagar' : 'A receber'}</option>
              <option value="pending">Pendente</option>
              <option value="paid">{ehPagar ? 'Pago' : 'Recebido'}</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          <button onClick={() => setRowSelection({})} className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-700 whitespace-nowrap">
            Limpar seleção
          </button>
        </div>
      )}

      <Card>
        {lancamentosExibidos.length === 0 ? (
          <Vazio mensagem={busca && lancamentos.length > 0 ? 'Nenhum lançamento para essa busca.' : 'Nenhum lançamento encontrado.'} />
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
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Categoria</label>
              <select className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Sem categoria</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
              <label className="block text-sm font-medium mb-1">Observações</label>
              <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={form.is_recurring}
                  onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                />
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <Repeat size={14} className="text-indigo-500" />
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

      {/* Modal: importar planilha */}
      <Modal titulo="Importar Lançamentos" aberto={importAberto} onFechar={fecharImport}>
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 leading-relaxed">
            <p className="font-semibold text-slate-800 mb-1">Colunas reconhecidas no cabeçalho (case insensitive):</p>
            <p><span className="font-medium text-slate-700">Obrigatórias:</span> Descrição · Valor · Vencimento</p>
            <p><span className="font-medium text-slate-700">Opcionais:</span> Emissão · {ehPagar ? 'Fornecedor' : 'Cliente'} · Categoria · Conta · Observações · Status · Recorrente</p>
            <p className="mt-1.5 text-slate-400">Datas: DD/MM/AAAA ou AAAA-MM-DD · Valores: vírgula ou ponto decimal · Recorrente: sim/não</p>
          </div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Arquivo (.xlsx ou .csv)</label>
            <button type="button" onClick={downloadTemplate} className="text-xs text-indigo-600 hover:text-indigo-800 underline">
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
          {importErro && <p className="text-sm text-red-600">{importErro}</p>}
          {importLinhas.length > 0 && (
            <>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{importValidas}</span> linha{importValidas !== 1 ? 's' : ''} válida{importValidas !== 1 ? 's' : ''} encontrada{importValidas !== 1 ? 's' : ''}
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="text-xs min-w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {importHeaders.map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-left font-medium text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importLinhas.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        {importHeaders.map((_, j) => (
                          <td key={j} className="px-2 py-1.5 text-slate-700 whitespace-nowrap">{row[j] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importLinhas.length > 5 && (
                <p className="text-xs text-slate-400">… e mais {importLinhas.length - 5} linha{importLinhas.length - 5 !== 1 ? 's' : ''}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={confirmarImport}
                  disabled={importando || importValidas === 0}
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
