import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Upload, Download, Search, FileText, BarChart3, ShoppingCart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { useFaturaWorld } from '../hooks/useFaturaWorld'
import { importarFaturaOFX } from '../lib/importarFatura'
import { fmt, valorComSinal } from '../lib/fatura'
import TagSelector from '../components/fatura/TagSelector'
import ExportMenu, { type TxView } from '../components/fatura/ExportMenu'
import FaturaDashboard from '../components/fatura/FaturaDashboard'
import PurchaseItemsTab, { type NovoItem } from '../components/fatura/PurchaseItemsTab'
import PendingImportModal from '../components/fatura/PendingImportModal'
import { Card, Badge, ErroBanner, PageHeader, btnSecundario } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'
import type { RowSelectionState } from '@tanstack/react-table'
import type { Invoice, PurchaseItem } from '../lib/types'

// Página da fatura — padronizada no design system (PageHeader-like + Card +
// DataTable + componentes compartilhados). As 3 abas (Lançamentos / Dashboard /
// Compras), busca, pílulas de filtro por categoria (só com count>0, contrato
// #13), badge "✦ auto" (contrato #4), total no rodapé, export (contrato #9) e
// modal de pendentes pós-import (contrato #7) seguem idênticos no comportamento.
type Aba = 'lancamentos' | 'dashboard' | 'compras'

const ABAS: { key: Aba; label: string; Icon: typeof FileText }[] = [
  { key: 'lancamentos', label: 'Lançamentos', Icon: FileText },
  { key: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
  { key: 'compras', label: 'Compras', Icon: ShoppingCart },
]

export default function Fatura() {
  const { id } = useParams<{ id: string }>()
  const { session, isAdmin, recarregarPendentes } = useApp()
  const { categorias, purchaseCategorias, regras, erro: erroWorld, addCategoria, addPurchaseCategoria } = useFaturaWorld()
  const navigate = useNavigate()
  const location = useLocation()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [transactions, setTransactions] = useState<TxView[]>([])
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([])
  const [pendentes, setPendentes] = useState<PurchaseItem[] | null>(
    (location.state as { pendentes?: PurchaseItem[] } | null)?.pendentes?.length
      ? (location.state as { pendentes: PurchaseItem[] }).pendentes
      : null
  )
  const [activeTab, setActiveTab] = useState<Aba>('lancamentos')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
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
        category: t.category,
        auto: !!t.auto_categorized,
        kind: (t.kind ?? 'debit') as 'debit' | 'credit',
      }))
    )

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
  const setCategory = useCallback(async (txId: string, cat: string | null) => {
    setTransactions((prev) => prev.map((t) => (t.id === txId ? { ...t, category: cat } : t)))
    const { error } = await supabase.from('transactions').update({ category: cat }).eq('id', txId)
    if (error) setErro('Erro ao salvar categoria: ' + error.message)
  }, [])

  // addCategoria do hook não é estável; ref mantém a memo de colunas lint-clean
  const addCategoriaRef = useRef(addCategoria)
  useEffect(() => { addCategoriaRef.current = addCategoria }, [addCategoria])
  const onAddCategoria = useCallback((name: string) => addCategoriaRef.current(name), [])

  const addItem = async (item: NovoItem) => {
    if (!session) return
    const { data, error } = await supabase
      .from('purchase_items')
      .insert({
        user_id: session.user.id,
        invoice_id: id,
        description: item.description,
        amount: item.amount === '' || item.amount == null ? null : Number(item.amount),
        category: item.category || null,
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
    const { ok, erro: e } = await importarFaturaOFX(file, regras, session.user.id, invoice?.account_id ?? null)
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

  // ── derivados ──────────────────────────────────────────────────────────────
  const filtered = transactions.filter((t) => {
    const matchSearch = t.memo.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || (filter === 'sem' && !t.category) || t.category === filter
    return matchSearch && matchFilter
  })
  const totalFiltered = filtered.reduce((s, t) => s + valorComSinal(t), 0)
  const semCategoria = transactions.filter((t) => !t.category).length

  // seleção em massa: só conta os marcados que ESTÃO visíveis (respeita o filtro)
  const filteredIds = new Set(filtered.map((t) => t.id))
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id] && filteredIds.has(id))

  const aplicarCategoriaEmMassa = async (cat: string | null) => {
    if (selectedIds.length === 0) return
    const alvo = new Set(selectedIds)
    setTransactions((prev) => prev.map((t) => (alvo.has(t.id) ? { ...t, category: cat } : t)))
    setRowSelection({})
    const { error } = await supabase.from('transactions').update({ category: cat }).in('id', selectedIds)
    if (error) setErro('Erro ao alterar categorias em massa: ' + error.message)
  }

  const handleDashFilterClick = (cat: string) => {
    setFilter(cat === 'Sem categoria' ? 'sem' : cat)
    setSearch('')
    setActiveTab('lancamentos')
  }

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
      id: 'category', header: 'Categoria', size: 240,
      cell: (t) => (
        <div className="flex items-center gap-1.5">
          <TagSelector value={t.category} categories={categorias} onChange={(cat) => setCategory(t.id, cat)} onAddCategory={onAddCategoria} readOnly={!isAdmin} />
          {t.auto && t.category && (
            <span title="Categorizado automaticamente" className="text-[10px] text-brand bg-brand-subtle border border-brand-subtle rounded-full px-1.5 py-0.5 font-bold whitespace-nowrap">✦ auto</span>
          )}
        </div>
      ),
    },
  ], [filtered.length, totalFiltered, categorias, isAdmin, setCategory, onAddCategoria])

  return (
    <div>
      {/* Header da fatura */}
      <PageHeader
        titulo={invoice?.name || 'Fatura'}
        voltar={() => navigate('/faturas')}
        meta={
          <>
            <Badge tom="muted">{transactions.length} lançamentos</Badge>
            {semCategoria > 0 && <Badge tom="warning">{semCategoria} sem categoria</Badge>}
          </>
        }
        acao={
          <div className="flex items-center gap-2 shrink-0">
            {invoice?.ofx_path && (
              <button onClick={baixarOFX} className={btnSecundario} title="Baixar o arquivo OFX original desta fatura">
                <Download size={16} /> Baixar OFX
              </button>
            )}
            <ExportMenu transactions={transactions} filtered={filtered} filter={filter} />
            <label className={btnSecundario + (!isAdmin ? ' opacity-40 pointer-events-none' : importando ? ' opacity-60 pointer-events-none' : ' cursor-pointer')}>
              <Upload size={16} />
              {importando ? 'Importando…' : 'Nova fatura'}
              <input ref={fileInput} type="file" accept=".ofx" className="hidden" disabled={importando}
                onChange={(e) => onNovoArquivo(e.target.files?.[0])} />
            </label>
          </div>
        }
      />

      <ErroBanner mensagem={erro ?? erroWorld} />

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
            <div className="flex gap-1.5 flex-wrap mt-3">
              {[
                { key: 'all', label: `Todos (${transactions.length})` },
                { key: 'sem', label: `Sem categoria (${semCategoria})` },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1 rounded-full border text-xs font-semibold transition ${
                    filter === key ? 'bg-brand-subtle text-brand border-brand-subtle' : 'border-border text-fg-muted hover:bg-surface-2'
                  }`}
                >
                  {label}
                </button>
              ))}
              {categorias.map((c) => {
                const count = transactions.filter((t) => t.category === c.name).length
                if (!count) return null
                const ativo = filter === c.name
                return (
                  <button
                    key={c.name}
                    onClick={() => setFilter(ativo ? 'all' : c.name)}
                    className={`px-3 py-1 rounded-full border text-xs font-semibold transition ${ativo ? '' : 'border-border text-fg-muted hover:bg-surface-2'}`}
                    style={ativo ? { background: c.color.bg, color: c.color.text, borderColor: c.color.border } : undefined}
                  >
                    {c.name} ({count})
                  </button>
                )
              })}
            </div>
          </Card>
          {isAdmin && selectedIds.length > 0 && (
            <div className="flex items-center gap-3 mb-4 p-3 rounded-card border border-brand-subtle bg-brand-subtle flex-wrap">
              <span className="text-sm font-semibold text-brand whitespace-nowrap">
                {selectedIds.length} selecionado{selectedIds.length !== 1 ? 's' : ''}
              </span>
              <span className="text-sm text-fg-muted whitespace-nowrap">Mudar categoria para:</span>
              <TagSelector value={null} categories={categorias} onChange={aplicarCategoriaEmMassa} onAddCategory={onAddCategoria} />
              <button
                onClick={() => setRowSelection({})}
                className="ml-auto text-xs font-medium text-fg-muted hover:text-fg whitespace-nowrap"
              >
                Limpar seleção
              </button>
            </div>
          )}
          <Card className="p-3">
            <DataTable
              tableKey="fatura-lancamentos"
              columns={colunas}
              data={filtered}
              getRowId={(t) => t.id}
              empty="Nenhum lançamento encontrado."
              enableSelection={isAdmin}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
            />
          </Card>
        </>
      )}

      {/* Aba: Dashboard */}
      {activeTab === 'dashboard' && (
        <FaturaDashboard transactions={transactions} categories={categorias} onFilterClick={handleDashFilterClick} />
      )}

      {/* Aba: Compras */}
      {activeTab === 'compras' && (
        <PurchaseItemsTab
          items={purchaseItems}
          categories={purchaseCategorias}
          onAdd={addItem}
          onUpdate={updateItem}
          onDelete={deleteItem}
          onAddCategory={addPurchaseCategoria}
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
