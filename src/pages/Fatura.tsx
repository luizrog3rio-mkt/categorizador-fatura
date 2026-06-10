import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { useFaturaWorld } from '../hooks/useFaturaWorld'
import { importarFaturaOFX } from '../lib/importarFatura'
import { fmt } from '../lib/fatura'
import { S } from '../components/fatura/estilos'
import TagSelector from '../components/fatura/TagSelector'
import ExportMenu, { type TxView } from '../components/fatura/ExportMenu'
import FaturaDashboard from '../components/fatura/FaturaDashboard'
import PurchaseItemsTab, { type NovoItem } from '../components/fatura/PurchaseItemsTab'
import PendingImportModal from '../components/fatura/PendingImportModal'
import { ErroBanner } from '../components/ui'
import type { Invoice, PurchaseItem } from '../lib/types'

// Página da fatura — port da "invoice view" do App.jsx com as 3 abas
// (Lançamentos / Dashboard / Compras), busca, pílulas de filtro por categoria
// (só com count>0, contrato #13), badge "✦ auto" (contrato #4), footer sticky,
// export (contrato #9) e modal de pendentes pós-import (contrato #7).
type Aba = 'lancamentos' | 'dashboard' | 'compras'

export default function Fatura() {
  const { id } = useParams<{ id: string }>()
  const { session, recarregarPendentes } = useApp()
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
  const setCategory = async (txId: string, cat: string | null) => {
    setTransactions((prev) => prev.map((t) => (t.id === txId ? { ...t, category: cat } : t)))
    const { error } = await supabase.from('transactions').update({ category: cat }).eq('id', txId)
    if (error) setErro('Erro ao salvar categoria: ' + error.message)
  }

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

  // ── derivados ──────────────────────────────────────────────────────────────
  const filtered = transactions.filter((t) => {
    const matchSearch = t.memo.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || (filter === 'sem' && !t.category) || t.category === filter
    return matchSearch && matchFilter
  })
  const totalFiltered = filtered.reduce((s, t) => s + t.amount, 0)
  const semCategoria = transactions.filter((t) => !t.category).length

  const handleDashFilterClick = (cat: string) => {
    setFilter(cat === 'Sem categoria' ? 'sem' : cat)
    setSearch('')
    setActiveTab('lancamentos')
  }

  return (
    <div style={{ margin: '-1.5rem -1.5rem 0', minHeight: 'calc(100vh - 0px)', background: '#f8fafc' }}>
      {/* Header da fatura */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <button
            onClick={() => navigate('/faturas')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b', padding: '0 4px', flexShrink: 0 }}
            title="Voltar"
          >←</button>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            💳 {invoice?.name || 'Fatura'}
          </span>
          <span style={{ ...S.chip, flexShrink: 0 }}>{transactions.length} lançamentos</span>
          {semCategoria > 0 && (
            <span style={{ ...S.chip, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', flexShrink: 0 }}>
              {semCategoria} sem categoria
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <ExportMenu transactions={transactions} filtered={filtered} filter={filter} />
          <label style={{ ...S.newBtn, cursor: importando ? 'wait' : 'pointer', opacity: importando ? 0.6 : 1 }}>
            📂 Nova fatura
            <input ref={fileInput} type="file" accept=".ofx" style={{ display: 'none' }} disabled={importando}
              onChange={(e) => onNovoArquivo(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      <div style={{ padding: '0 0 0' }}>
        <ErroBanner mensagem={erro ?? erroWorld} />
      </div>

      {/* Abas */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 20px', display: 'flex' }}>
        {([
          { key: 'lancamentos', label: '📋  Lançamentos' },
          { key: 'dashboard', label: '📊  Dashboard' },
          { key: 'compras', label: '🛒  Compras' },
        ] as { key: Aba; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '12px 18px', background: 'transparent', border: 'none',
              borderBottom: activeTab === key ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === key ? '#1d4ed8' : '#64748b',
              fontWeight: activeTab === key ? 700 : 500, fontSize: 13,
              cursor: 'pointer', marginBottom: -1,
            }}
          >{label}</button>
        ))}
      </div>

      {/* Aba: Lançamentos */}
      {activeTab === 'lancamentos' && (
        <>
          <div style={S.filterBar}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍  Buscar descrição..." style={S.search} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {[
                { key: 'all', label: `Todos (${transactions.length})` },
                { key: 'sem', label: `Sem categoria (${semCategoria})` },
              ].map(({ key, label }) => (
                <button key={key} style={{ ...S.tab, ...(filter === key ? S.tabOn : {}) }} onClick={() => setFilter(key)}>{label}</button>
              ))}
              {categorias.map((c) => {
                const count = transactions.filter((t) => t.category === c.name).length
                if (!count) return null
                return (
                  <button
                    key={c.name}
                    style={{ ...S.tab, ...(filter === c.name ? { background: c.color.bg, color: c.color.text, borderColor: c.color.border } : {}) }}
                    onClick={() => setFilter(filter === c.name ? 'all' : c.name)}
                  >
                    {c.name} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{ ...S.th, width: 88 }}>Data</th>
                  <th style={S.th}>Descrição</th>
                  <th style={{ ...S.th, textAlign: 'right', width: 120 }}>Valor</th>
                  <th style={{ ...S.th, width: 250 }}>Categoria</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    style={S.row}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                  >
                    <td style={{ ...S.td, color: '#94a3b8', fontSize: 12 }}>{t.date}</td>
                    <td style={S.td}><span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{t.memo}</span></td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{fmt(t.amount)}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <TagSelector value={t.category} categories={categorias} onChange={(cat) => setCategory(t.id, cat)} onAddCategory={addCategoria} />
                        {t.auto && t.category && (
                          <span title="Categorizado automaticamente" style={{ fontSize: 10, color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '2px 7px', fontWeight: 700, whiteSpace: 'nowrap' }}>✦ auto</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>Nenhum lançamento encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={S.footer}>
            <span style={{ color: '#64748b', fontSize: 13 }}>
              {filtered.length} lançamento{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Total: {fmt(totalFiltered)}</span>
          </div>
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
        />
      )}

      {/* Modal: selecionar pendentes ao importar (contrato #7) */}
      {pendentes && (
        <PendingImportModal items={pendentes} onConfirm={confirmarPendentes} onCancel={() => setPendentes(null)} />
      )}
    </div>
  )
}
