import { useState } from 'react'
import { Plus, Trash2, ShoppingCart, Calendar, Lightbulb } from 'lucide-react'
import { currentMonth, formatMonth } from '../../lib/fatura'
import type { PurchaseItem } from '../../lib/types'
import { Card, btnPrimario } from '../ui'
import ColumnVisibilityMenu, { type ColMeta } from '../ColumnVisibilityMenu'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'

// colunas ocultáveis (só esconder — a tabela de compras tem edição inline)
const PI_COLS: ColMeta[] = [
  { id: 'date', label: 'Data' },
  { id: 'description', label: 'Descrição' },
  { id: 'payment', label: 'Pagamento' },
  { id: 'amount', label: 'Valor' },
]

// Anotações de compra (contrato #8: não entram em totais; valor opcional; edição
// inline por blur; exclusão de ITEM sem confirm). isPending=true = view global de
// pendentes agrupada por mês. Padronizado no design system (Card + Tailwind).
// A categoria dos itens foi removida em 2026-06-25.

export interface NovoItem {
  description: string
  amount: string
  month: string | null
  purchaseDate: string
  paymentMethod: string
}

const editCls = 'w-full bg-transparent border border-transparent focus:border-border-strong rounded-control px-1.5 py-1 text-sm text-fg-muted outline-none'
const formCls = 'rounded-control border border-border-strong px-3 py-2 text-sm text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand'

export default function PurchaseItemsTab({
  items,
  onAdd,
  onUpdate,
  onDelete,
  isPending,
  readOnly = false,
  carregando = false,
}: {
  items: PurchaseItem[]
  onAdd: (item: NovoItem) => void
  onUpdate: (id: string, fields: Partial<PurchaseItem>) => void
  onDelete: (id: string) => void
  isPending: boolean
  readOnly?: boolean
  carregando?: boolean
}) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
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
      // mês de competência derivado da data da compra (campo único); sem data, usa o mês atual
      month: isPending ? (purchaseDate ? purchaseDate.slice(0, 7) : currentMonth()) : null,
      purchaseDate,
      paymentMethod,
    })
    setDescription(''); setAmount('')
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
    <div>
      {!readOnly && (
        <Card className="p-4 mb-4">
          <div className="font-semibold text-sm text-fg mb-2.5">Adicionar item de compra</div>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              type="date" value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              title="Data da compra"
              className={`${formCls} w-36`}
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="O que você comprou?"
              className={`${formCls} flex-1 min-w-[200px]`}
            />
            <input
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="Forma de pagamento"
              className={`${formCls} w-40`}
            />
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              type="number" step="0.01" placeholder="Valor (opcional)"
              className={`${formCls} w-36`}
            />
            <button onClick={handleAdd} disabled={!description.trim()} className={btnPrimario}>
              <Plus size={16} /> Adicionar
            </button>
          </div>
          <p className="flex items-center gap-1.5 mt-2.5 text-xs text-fg-subtle">
            <Lightbulb size={13} className="shrink-0" />
            Itens aqui são anotações — não entram em totais nem no dashboard.
            {isPending && ' Ao importar uma fatura, você poderá selecionar quais itens incluir.'}
          </p>
        </Card>
      )}

      {items.length > 0 && (
        <div className="flex justify-end mb-3">
          <ColumnVisibilityMenu columns={PI_COLS} isVisible={colVisivel} onToggle={alternarCol} onReset={colPrefs.reset} />
        </div>
      )}

      {groupKeys.map((gk) => {
        const groupItems = grouped[gk]
        return (
          <Card key={gk || 'single'} className="overflow-hidden mb-3">
            <div className="px-4 py-3 border-b border-border flex justify-between items-baseline">
              <span className="flex items-center gap-1.5 font-semibold text-sm text-fg">
                {isPending && <Calendar size={14} className="text-fg-subtle" />}
                {isPending ? formatMonth(gk || null) : 'Itens desta fatura'}
              </span>
              <span className="text-xs text-fg-subtle">
                {groupItems.length} {groupItems.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    {colVisivel('date') && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-fg-muted w-36">Data</th>}
                    {colVisivel('description') && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-fg-muted">Descrição</th>}
                    {colVisivel('payment') && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-fg-muted w-40">Pagamento</th>}
                    {colVisivel('amount') && <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-fg-muted w-32">Valor</th>}
                    {!readOnly && <th className="w-12" />}
                  </tr>
                </thead>
                <tbody>
                  {groupItems.map((it) => (
                    <tr key={it.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                      {colVisivel('date') && (
                        <td className="px-4 py-2 align-middle">
                          <input
                            type="date" defaultValue={it.purchase_date ?? ''}
                            onBlur={(e) => { const v = e.target.value || null; if (v !== it.purchase_date) onUpdate(it.id, { purchase_date: v }) }}
                            disabled={readOnly}
                            className={editCls}
                          />
                        </td>
                      )}
                      {colVisivel('description') && (
                        <td className="px-4 py-2 align-middle">
                          <input
                            defaultValue={it.description}
                            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.description) onUpdate(it.id, { description: v }) }}
                            disabled={readOnly}
                            className="w-full bg-transparent border-none text-sm text-fg font-medium outline-none"
                          />
                        </td>
                      )}
                      {colVisivel('payment') && (
                        <td className="px-4 py-2 align-middle">
                          <input
                            defaultValue={it.payment_method ?? ''}
                            onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== it.payment_method) onUpdate(it.id, { payment_method: v }) }}
                            placeholder="—"
                            disabled={readOnly}
                            className={editCls}
                          />
                        </td>
                      )}
                      {colVisivel('amount') && (
                        <td className="px-4 py-2 align-middle text-right">
                          <input
                            type="number" step="0.01"
                            defaultValue={it.amount ?? ''}
                            onBlur={(e) => {
                              const raw = e.target.value
                              const v = raw === '' ? null : Number(raw)
                              if (v !== it.amount) onUpdate(it.id, { amount: v })
                            }}
                            placeholder="—"
                            disabled={readOnly}
                            className={`${editCls} text-right font-semibold text-fg tnum`}
                          />
                        </td>
                      )}
                      {!readOnly && (
                        <td className="px-4 py-2 align-middle">
                          <button
                            onClick={() => onDelete(it.id)}
                            className="text-fg-subtle hover:text-expense p-1 rounded-control transition"
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}

      {items.length === 0 && (
        <Card className="py-12 px-6 text-center text-fg-subtle">
          {carregando ? (
            <p className="text-sm">Carregando…</p>
          ) : (
            <>
              <div className="flex justify-center mb-2"><ShoppingCart size={36} /></div>
              <p className="text-sm">Nenhum item lançado ainda</p>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
