import { useState } from 'react'
import { ShoppingCart, Calendar } from 'lucide-react'
import { fmt, formatMonth } from '../../lib/fatura'
import type { PurchaseItem } from '../../lib/types'
import { btnPrimario, btnSecundario, Badge } from '../ui'

// Modal de pendentes (contrato #7): abre automaticamente após importar fatura
// com pendentes existentes, todos pré-selecionados, agrupados por mês desc;
// "Pular" mantém pendentes; confirmar atrela à fatura. Padronizado no design
// system (overlay + card + botões compartilhados); comportamento idêntico.
export default function PendingImportModal({
  items,
  onConfirm,
  onCancel,
}: {
  items: PurchaseItem[]
  onConfirm: (ids: string[]) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.id)))

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const grouped = items.reduce((acc, it) => {
    const k = it.month || ''
    ;(acc[k] = acc[k] || []).push(it)
    return acc
  }, {} as Record<string, PurchaseItem[]>)
  const groupKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const toggleGroup = (gk: string) => {
    const ids = grouped[gk].map((i) => i.id)
    const allSelected = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-fg/40" onClick={onCancel} />
      <div className="relative bg-surface rounded-modal shadow-pop w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-fg flex items-center gap-2">
            <ShoppingCart size={18} /> Importar compras pendentes
          </h3>
          <p className="text-sm text-fg-muted mt-0.5">
            Selecione quais itens incluir nesta fatura. Os não selecionados continuam pendentes.
          </p>
        </div>

        <div className="overflow-y-auto px-6 py-3 flex-1">
          {groupKeys.map((gk) => {
            const groupItems = grouped[gk]
            const allSelected = groupItems.every((i) => selected.has(i.id))
            return (
              <div key={gk || 'single'} className="mb-4">
                <label
                  onClick={() => toggleGroup(gk)}
                  className="flex items-center gap-2 py-1.5 cursor-pointer border-b border-border mb-1"
                >
                  <input type="checkbox" checked={allSelected} readOnly className="cursor-pointer" />
                  <Calendar size={14} className="text-fg-subtle" />
                  <span className="font-semibold text-sm text-fg">{formatMonth(gk || null)}</span>
                  <span className="text-xs text-fg-subtle">({groupItems.length})</span>
                </label>
                {groupItems.map((it) => (
                  <label
                    key={it.id}
                    className="flex items-center gap-2.5 px-1.5 py-2 cursor-pointer rounded-control hover:bg-surface-2"
                  >
                    <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} className="cursor-pointer" />
                    {it.purchase_date && (
                      <span className="text-xs text-fg-subtle tnum min-w-[70px]">
                        {it.purchase_date.split('-').reverse().join('/')}
                      </span>
                    )}
                    <span className="flex-1 text-sm text-fg">{it.description}</span>
                    {it.payment_method && <span className="text-xs text-fg-muted">{it.payment_method}</span>}
                    {it.category && <Badge tom="muted">{it.category}</Badge>}
                    {it.amount != null && (
                      <span className="text-xs font-bold text-fg tnum">{fmt(Number(it.amount))}</span>
                    )}
                  </label>
                ))}
              </div>
            )
          })}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-between items-center">
          <span className="text-xs text-fg-muted">{selected.size} de {items.length} selecionados</span>
          <div className="flex gap-2">
            <button onClick={onCancel} className={btnSecundario}>Pular</button>
            <button onClick={() => onConfirm([...selected])} className={btnPrimario}>Importar selecionados</button>
          </div>
        </div>
      </div>
    </div>
  )
}
