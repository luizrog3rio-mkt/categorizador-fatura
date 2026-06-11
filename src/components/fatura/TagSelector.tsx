import { useEffect, useRef, useState } from 'react'
import type { CatUI } from '../../lib/fatura'

// Port 1:1 do TagSelector original (App.jsx) — pílula com cor da categoria,
// dropdown com paleta, remover categoria e criar nova inline.
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
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => !readOnly && setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20,
          border: cat ? `1.5px solid ${cat.color.border}` : '1.5px dashed #cbd5e1',
          background: cat ? cat.color.bg : 'transparent', color: cat ? cat.color.text : '#94a3b8',
          cursor: 'pointer', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', minWidth: 160,
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>{cat ? cat.name : 'Selecionar categoria'}</span>
        <span style={{ fontSize: 9, opacity: 0.5 }}>▼</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.13)', minWidth: 210, zIndex: 9999 }}>
          {categories.map((c) => (
            <div
              key={c.name}
              onClick={() => { onChange(c.name); setOpen(false) }}
              style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: 20, background: c.color.bg, color: c.color.text, border: `1px solid ${c.color.border}`, fontWeight: 600, fontSize: 12 }}>{c.name}</span>
              {value === c.name && <span style={{ marginLeft: 'auto', color: '#3b82f6', fontSize: 13 }}>✓</span>}
            </div>
          ))}
          {value && (
            <div
              onClick={() => { onChange(null); setOpen(false) }}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              ✕ Remover categoria
            </div>
          )}
          <div style={{ padding: '8px 10px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); e.stopPropagation() }}
              placeholder="Nova categoria..."
              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 12, outline: 'none', color: '#334155' }}
            />
            <button onClick={handleAdd} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>+</button>
          </div>
        </div>
      )}
    </div>
  )
}
