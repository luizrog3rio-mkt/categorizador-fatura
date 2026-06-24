import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, X, Plus } from 'lucide-react'
import type { CatUI } from '../../lib/fatura'

// Seletor de categoria — pílula com a cor da categoria (cores dinâmicas via
// style), dropdown com a paleta, remover categoria e criar nova inline.
// Comportamento idêntico ao port; só o visual foi padronizado (Tailwind/lucide).
export default function TagSelector({
  value,
  categories,
  onChange,
  onAddCategory,
  readOnly = false,
}: {
  value: string | null
  categories: CatUI[]
  onChange: (cat: string | null) => void
  onAddCategory: (name: string) => void
  readOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const cat = categories.find((c) => c.name === value)
  const handleAdd = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    onAddCategory(trimmed)
    onChange(trimmed)
    setNewName('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => !readOnly && setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap min-w-40 border ${
          cat ? '' : 'border-dashed border-border-strong text-fg-subtle'
        } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
        style={cat ? { background: cat.color.bg, color: cat.color.text, borderColor: cat.color.border } : undefined}
      >
        <span className="flex-1 text-left">{cat ? cat.name : 'Selecionar categoria'}</span>
        <ChevronDown size={12} className="opacity-50" />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-[9999] min-w-52 rounded-card border border-border bg-surface shadow-pop">
          <div className="max-h-72 overflow-y-auto py-1">
            {categories.map((c) => (
              <div
                key={c.name}
                onClick={() => { onChange(c.name); setOpen(false) }}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-2"
              >
                <span
                  className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold border"
                  style={{ background: c.color.bg, color: c.color.text, borderColor: c.color.border }}
                >
                  {c.name}
                </span>
                {value === c.name && <Check size={14} className="ml-auto text-brand" />}
              </div>
            ))}
          </div>
          {value && (
            <div
              onClick={() => { onChange(null); setOpen(false) }}
              className="flex items-center gap-1.5 px-3 py-2 cursor-pointer text-xs text-fg-subtle border-t border-border hover:bg-surface-2"
            >
              <X size={12} /> Remover categoria
            </div>
          )}
          <div className="flex gap-1.5 p-2 border-t border-border">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); e.stopPropagation() }}
              placeholder="Nova categoria..."
              className="flex-1 rounded-control border border-border px-2 py-1 text-xs text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <button
              onClick={handleAdd}
              className="bg-brand hover:bg-brand-strong text-white rounded-control px-2.5 flex items-center justify-center"
              title="Criar categoria"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
