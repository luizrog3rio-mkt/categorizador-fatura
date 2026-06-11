import { useState } from 'react'
import TagSelector from './TagSelector'
import { S } from './estilos'
import { currentMonth, formatMonth, type CatUI } from '../../lib/fatura'
import type { PurchaseItem } from '../../lib/types'
import ColumnVisibilityMenu, { type ColMeta } from '../ColumnVisibilityMenu'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'

// colunas ocultáveis (só esconder — mundo fatura é travado, sem drag/resize)
const PI_COLS: ColMeta[] = [
  { id: 'date', label: 'Data' },
  { id: 'description', label: 'Descrição' },
  { id: 'payment', label: 'Pagamento' },
  { id: 'amount', label: 'Valor' },
  { id: 'category', label: 'Categoria' },
]

// Port 1:1 da PurchaseItemsTab do App.jsx — anotações de compra (contrato #8:
// não entram em totais; valor opcional; edição inline por blur; exclusão de
// ITEM sem confirm). isPending=true = view global de pendentes agrupada por mês.

export interface NovoItem {
  description: string
  amount: string
  category: string | null
  month: string | null
  purchaseDate: string
  paymentMethod: string
}

export default function PurchaseItemsTab({
  items,
  categories,
  onAdd,
  onUpdate,
  onDelete,
  onAddCategory,
  isPending,
  readOnly = false,
}: {
  items: PurchaseItem[]
  categories: CatUI[]
  onAdd: (item: NovoItem) => void
  onUpdate: (id: string, fields: Partial<PurchaseItem>) => void
  onDelete: (id: string) => void
  onAddCategory: (name: string) => void
  isPending: boolean
  readOnly?: boolean
}) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [month, setMonth] = useState(currentMonth())
  const [purchaseDate, setPurchaseDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')

  // visibilidade de coluna (só esconder/mostrar), persistida por usuário
  const colPrefs = useColumnPrefs('purchase-items')
  const colVisivel = (id: string) => colPrefs.columnVisibility[id] !== false
  const alternarCol = (id: string) => colPrefs.onColumnVisibilityChange({ ...colPrefs.columnVisibility, [id]: !colVisivel(id) })

  const handleAdd = () => {
    const desc = description.trim()
    if (!desc) return
    onAdd({
      description: desc,
      amount,
      category,
      month: isPending ? month : null,
      purchaseDate,
      paymentMethod,
    })
    setDescription(''); setAmount(''); setCategory(null)
    setPurchaseDate(''); setPaymentMethod('')
  }

  const grouped: Record<string, PurchaseItem[]> = isPending
    ? items.reduce((acc, it) => {
        const k = it.month || ''
        ;(acc[k] = acc[k] || []).push(it)
        return acc
      }, {} as Record<string, PurchaseItem[]>)
    : { '': items }
  const groupKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div style={{ padding: 20 }}>
      {!readOnly && <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 10 }}>
          Adicionar item de compra
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="date" value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            title="Data da compra"
            style={{ width: 145, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', color: '#334155', background: '#f8fafc' }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder="O que você comprou?"
            style={{ flex: '1 1 200px', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', color: '#334155', background: '#f8fafc' }}
          />
          <input
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder="Forma de pagamento"
            style={{ width: 160, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', color: '#334155', background: '#f8fafc' }}
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            type="number" step="0.01" placeholder="Valor (opcional)"
            style={{ width: 130, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', color: '#334155', background: '#f8fafc' }}
          />
          <TagSelector value={category} categories={categories} onChange={setCategory} onAddCategory={onAddCategory} />
          {isPending && (
            <input
              type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', color: '#334155', background: '#f8fafc' }}
              title="Mês"
            />
          )}
          <button
            onClick={handleAdd}
            disabled={!description.trim()}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: description.trim() ? 'pointer' : 'not-allowed', opacity: description.trim() ? 1 : 0.5 }}
          >
            + Adicionar
          </button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94a3b8' }}>
          💡 Itens aqui são anotações — não entram em totais nem no dashboard.
          {isPending && ' Ao importar uma fatura, você poderá selecionar quais itens incluir.'}
        </p>
      </div>}

      {items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <ColumnVisibilityMenu columns={PI_COLS} isVisible={colVisivel} onToggle={alternarCol} onReset={colPrefs.reset} />
        </div>
      )}

      {groupKeys.map((gk) => {
        const groupItems = grouped[gk]
        return (
          <div key={gk || 'single'} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                {isPending ? `📅 ${formatMonth(gk || null)}` : 'Itens desta fatura'}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {groupItems.length} {groupItems.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {colVisivel('date') && <th style={{ ...S.th, width: 130 }}>Data</th>}
                  {colVisivel('description') && <th style={{ ...S.th }}>Descrição</th>}
                  {colVisivel('payment') && <th style={{ ...S.th, width: 150 }}>Pagamento</th>}
                  {colVisivel('amount') && <th style={{ ...S.th, textAlign: 'right', width: 120 }}>Valor</th>}
                  {colVisivel('category') && <th style={{ ...S.th, width: 200 }}>Categoria</th>}
                  <th style={{ ...S.th, width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {groupItems.map((it) => (
                  <tr
                    key={it.id}
                    style={S.row}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                  >
                    {colVisivel('date') && (
                    <td style={S.td}>
                      <input
                        type="date" defaultValue={it.purchase_date ?? ''}
                        onBlur={(e) => { const v = e.target.value || null; if (v !== it.purchase_date) onUpdate(it.id, { purchase_date: v }) }}
                        style={{ width: 130, border: '1px solid transparent', background: 'transparent', fontSize: 13, color: '#334155', outline: 'none', borderRadius: 6, padding: '4px 6px' }}
                        onFocus={(e) => (e.target.style.borderColor = '#e2e8f0')}
                      />
                    </td>
                    )}
                    {colVisivel('description') && (
                    <td style={S.td}>
                      <input
                        defaultValue={it.description}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.description) onUpdate(it.id, { description: v }) }}
                        style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, color: '#1e293b', fontWeight: 500, outline: 'none' }}
                      />
                    </td>
                    )}
                    {colVisivel('payment') && (
                    <td style={S.td}>
                      <input
                        defaultValue={it.payment_method ?? ''}
                        onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== it.payment_method) onUpdate(it.id, { payment_method: v }) }}
                        placeholder="—"
                        style={{ width: '100%', border: '1px solid transparent', background: 'transparent', fontSize: 13, color: '#334155', outline: 'none', borderRadius: 6, padding: '4px 6px' }}
                        onFocus={(e) => (e.target.style.borderColor = '#e2e8f0')}
                      />
                    </td>
                    )}
                    {colVisivel('amount') && (
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      <input
                        type="number" step="0.01"
                        defaultValue={it.amount ?? ''}
                        onBlur={(e) => {
                          const raw = e.target.value
                          const v = raw === '' ? null : Number(raw)
                          if (v !== it.amount) onUpdate(it.id, { amount: v })
                        }}
                        placeholder="—"
                        style={{ width: 100, textAlign: 'right', border: '1px solid transparent', background: 'transparent', fontSize: 13, color: '#0f172a', fontWeight: 700, outline: 'none', borderRadius: 6, padding: '4px 6px' }}
                        onFocus={(e) => (e.target.style.borderColor = '#e2e8f0')}
                      />
                    </td>
                    )}
                    {colVisivel('category') && (
                    <td style={S.td}>
                      <TagSelector
                        value={it.category}
                        categories={categories}
                        onChange={(cat) => onUpdate(it.id, { category: cat })}
                        onAddCategory={onAddCategory}
                      />
                    </td>
                    )}
                    {!readOnly && (
                    <td style={S.td}>
                      <button
                        onClick={() => onDelete(it.id)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '4px 8px', borderRadius: 6 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#cbd5e1')}
                        title="Excluir"
                      >✕</button>
                    </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}

      {items.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>
          <p style={{ margin: 0, fontSize: 14 }}>Nenhum item lançado ainda</p>
        </div>
      )}
    </div>
  )
}
