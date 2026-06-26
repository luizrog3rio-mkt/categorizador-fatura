import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Upload, Download, Search, FileText, BarChart3, ShoppingCart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { importarFaturaOFX } from '../lib/importarFatura'
import { fmt, valorComSinal } from '../lib/fatura'
import ExportMenu, { type TxView } from '../components/fatura/ExportMenu'
import FaturaDashboard from '../components/fatura/FaturaDashboard'
import PurchaseItemsTab, { type NovoItem } from '../components/fatura/PurchaseItemsTab'
import PendingImportModal from '../components/fatura/PendingImportModal'
import { Card, Badge, ErroBanner, PageHeader, btnSecundario } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'
import type { Invoice, PurchaseItem, ChartOfAccount } from '../lib/types'

// Página da fatura — 3 abas (Lançamentos / Dashboard / Compras), busca por
// descrição, total no rodapé, export (contrato #9) e modal de pendentes
// pós-import (contrato #7). A categorização (coluna, filtro por categoria,
// auto, ação em massa) foi removida em 2026-06-25 — a classificação financeira
// vive no Plano de Contas / DRE.
type Aba = 'lancamentos' | 'dashboard' | 'compras'

const ABAS: { key: Aba; label: string; Icon: typeof FileText }[] = [
  { key: 'lancamentos', label: 'Lançamentos', Icon: FileText },
  { key: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
  { key: 'compras', label: 'Compras', Icon: ShoppingCart },
]

export default function Fatura() {
  const { id } = useParams<{ id: string }>()
  const { session, isAdmin, recarregarPendentes } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [transactions, setTransactions] = useState<TxView[]>([])
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccount[]>([])
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([])
  const [pendentes, setPendentes] = useState<PurchaseItem[] | null>(
    (location.state as { pendentes?: PurchaseItem[] } | null)?.pendentes?.length
      ? (location.state as { pendentes: PurchaseItem[] }).pendentes
      : null
  )
  const [activeTab, setActiveTab] = useState<Aba>('lancamentos')
  const [search, setSearch] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    if (!id) return
    const { data: inv, error: e0 } = await supabase.from('invoices').select('*').eq('id', id).single()
    if (e0) { setErro('Erro ao carregar fatura: ' + e0.message); return }
    setInvoice(inv)

    const { data: txs, error: e1 } = await supabase
      .from('transactions')
      .select('*')
      .eq('invoice_id', id)
      .order('created_at')
    if (e1) { setErro('Erro ao carregar lançamentos: ' + e1.message); return }
    setTransactions(
      (txs ?? []).map((t) => ({
        id: t.id,
        date: t.date,
        memo: t.memo,
        amount: Number(t.amount),
        kind: (t.kind ?? 'debit') as 'debit' | 'credit',
        chart_of_account_id: t.chart_of_account_id ?? null,
      }))
    )

    // contas folha do plano (mesmo filtro do Lançamentos) pro seletor de classificação
    const { data: coas } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('active', true)
      .eq('is_analytical', true)
      .order('sort_order')
    setChartAccounts((coas as ChartOfAccount[]) ?? [])

    const { data: items, error: e2 } = await supabase
      .from('purchase_items')
      .select('*')
      .eq('invoice_id', id)
      .order('created_at')
    if (e2) { setErro('Erro ao carregar compras: ' + e2.message); return }
    setPurchaseItems(items ?? [])
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  // limpa o state de navegação pro F5 não reabrir o modal
  useEffect(() => {
    if (pendentes) window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── ações ──────────────────────────────────────────────────────────────────
  const addItem = async (item: NovoItem) => {
    if (!session) return
    const { data, error } = await supabase
      .from('purchase_items')
      .insert({
        user_id: session.user.id,
        invoice_id: id,
        description: item.description,
        amount: item.amount === '' || item.amount == null ? null : Number(item.amount),
        month: item.month || null,
        purchase_date: item.purchaseDate || null,
        payment_method: item.paymentMethod || null,
      })
      .select()
      .single()
    if (error) { setErro('Erro ao adicionar item: ' + error.message); return }
    if (data) setPurchaseItems((prev) => [...prev, data])
  }

  const updateItem = async (itemId: string, fields: Partial<PurchaseItem>) => {
    setPurchaseItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...fields } : it)))
    const { error } = await supabase.from('purchase_items').update(fields).eq('id', itemId)
    if (error) setErro('Erro ao salvar item: ' + error.message)
  }

  const deleteItem = async (itemId: string) => {
    setPurchaseItems((prev) => prev.filter((it) => it.id !== itemId))
    const { error } = await supabase.from('purchase_items').delete().eq('id', itemId)
    if (error) setErro('Erro ao excluir item: ' + error.message)
  }

  // contrato #7: atrela pendentes selecionados à fatura e vai pra aba Compras
  const confirmarPendentes = async (ids: string[]) => {
    if (ids.length === 0) { setPendentes(null); return }
    const { data, error } = await supabase
      .from('purchase_items')
      .update({ invoice_id: id })
      .in('id', ids)
      .select()
    if (error) setErro('Erro ao atrelar pendentes: ' + error.message)
    else if (data) {
      setPurchaseItems((prev) => [...prev, ...data])
      setActiveTab('compras')
      recarregarPendentes()
    }
    setPendentes(null)
  }

  // "Nova fatura" no header da fatura (igual ao app antigo)
  const onNovoArquivo = async (file: File | undefined | null) => {
    if (!file || !session) return
    setImportando(true)
    const { ok, erro: e } = await importarFaturaOFX(file, session.user.id, invoice?.account_id ?? null)
    setImportando(false)
    if (fileInput.current) fileInput.current.value = ''
    if (e) { setErro(e); return }
    if (ok) navigate(`/faturas/${ok.invoice.id}`, { state: { pendentes: ok.pendentes } })
  }

  // baixa o .ofx original da fatura (só existe em imports feitos após o Storage)
  const baixarOFX = async () => {
    if (!invoice?.ofx_path) return
    const { data, error } = await supabase.storage.from('faturas-ofx').download(invoice.ofx_path)
    if (error || !data) { setErro('Erro ao baixar o OFX: ' + (error?.message ?? 'arquivo não encontrado')); return }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = invoice.ofx_path.split('/').pop() || 'fatura.ofx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // marca a conta do plano num lançamento da fatura (alimenta a DRE por competência).
  // useCallback pra manter a memo das colunas estável (gotcha do DataTable).
  const setConta = useCallback(async (txId: string, accountId: string | null) => {
    setTransactions((prev) => prev.map((t) => (t.id === txId ? { ...t, chart_of_account_id: accountId } : t)))
    const { error } = await supabase.from('transactions').update({ chart_of_account_id: accountId }).eq('id', txId)
    if (error) setErro('Erro ao salvar a conta: ' + error.message)
  }, [])

  // ── derivados ──────────────────────────────────────────────────────────────
  const filtered = transactions.filter((t) => t.memo.toLowerCase().includes(search.toLowerCase()))
  const totalFiltered = filtered.reduce((s, t) => s + valorComSinal(t), 0)

  const colunas = useMemo<DataColumn<TxView>[]>(() => [
    {
      id: 'date', header: 'Data', size: 110,
      cell: (t) => <span className="text-fg-muted text-xs whitespace-nowrap">{t.date}</span>,
      footer: <span className="font-normal text-fg-muted">{filtered.length} lançamento{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''}</span>,
    },
    {
      id: 'memo', header: 'Descrição', size: 380,
      cell: (t) => <span className="text-fg-muted font-medium">{t.memo}</span>,
    },
    {
      id: 'amount', header: 'Valor', size: 130, align: 'right',
      cell: (t) => (
        <span className={`font-semibold tnum ${t.kind === 'credit' ? 'text-revenue' : 'text-fg'}`}>{fmt(valorComSinal(t))}</span>
      ),
      footer: <span className="font-bold text-fg tnum">Total: {fmt(totalFiltered)}</span>,
    },
    {
      id: 'tipo', header: 'Tipo', size: 100,
      cell: (t) => (
        <Badge tom={t.kind === 'credit' ? 'revenue' : 'muted'}>
          {t.kind === 'credit' ? 'Crédito' : 'Débito'}
        </Badge>
      ),
    },
    {
      id: 'conta', header: 'Plano de Contas', size: 240, grow: true,
      cell: (t) => (
        <select
          className="w-full rounded-control border border-border-strong bg-surface px-2 py-1 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          value={t.chart_of_account_id ?? ''}
          disabled={!isAdmin}
          onChange={(e) => setConta(t.id, e.target.value || null)}
        >
          <option value="">— sem conta —</option>
          {chartAccounts.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </select>
      ),
    },
  ], [filtered.length, totalFiltered, chartAccounts, isAdmin, setConta])

  return (
    <div>
      {/* Header da fatura */}
      <PageHeader
        titulo={invoice?.name || 'Fatura'}
        voltar={() => navigate('/faturas')}
        meta={<Badge tom="muted">{transactions.length} lançamentos</Badge>}
        acao={
          <div className="flex items-center gap-2 shrink-0">
            {invoice?.ofx_path && (
              <button onClick={baixarOFX} className={btnSecundario} title="Baixar o arquivo OFX original desta fatura">
                <Download size={16} /> Baixar OFX
              </button>
            )}
            <ExportMenu transactions={transactions} filtered={filtered} filter={search ? 'search' : 'all'} />
            <label className={btnSecundario + (!isAdmin ? ' opacity-40 pointer-events-none' : importando ? ' opacity-60 pointer-events-none' : ' cursor-pointer')}>
              <Upload size={16} />
              {importando ? 'Importando…' : 'Nova fatura'}
              <input ref={fileInput} type="file" accept=".ofx" className="hidden" disabled={importando}
                onChange={(e) => onNovoArquivo(e.target.files?.[0])} />
            </label>
          </div>
        }
      />

      <ErroBanner mensagem={erro} />

      {/* Abas */}
      <div className="flex border-b border-border mb-5">
        {ABAS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              activeTab === key ? 'border-brand text-brand' : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Aba: Lançamentos */}
      {activeTab === 'lancamentos' && (
        <>
          <Card className="p-4 mb-4">
            <div className="relative max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar descrição..."
                className="w-full rounded-control border border-border-strong bg-surface pl-9 pr-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </Card>
          <Card className="p-3">
            <DataTable
              tableKey="fatura-lancamentos"
              columns={colunas}
              data={filtered}
              getRowId={(t) => t.id}
              empty="Nenhum lançamento encontrado."
            />
          </Card>
        </>
      )}

      {/* Aba: Dashboard */}
      {activeTab === 'dashboard' && (
        <FaturaDashboard transactions={transactions} />
      )}

      {/* Aba: Compras */}
      {activeTab === 'compras' && (
        <PurchaseItemsTab
          items={purchaseItems}
          onAdd={addItem}
          onUpdate={updateItem}
          onDelete={deleteItem}
          isPending={false}
          readOnly={!isAdmin}
        />
      )}

      {/* Modal: selecionar pendentes ao importar (contrato #7) */}
      {pendentes && (
        <PendingImportModal items={pendentes} onConfirm={confirmarPendentes} onCancel={() => setPendentes(null)} />
      )}
    </div>
  )
}
