import { useState, type CSSProperties } from 'react'
import { SlidersHorizontal } from 'lucide-react'

// Menu "Colunas" standalone (só esconder/mostrar) pras tabelas inline do mundo
// fatura — onde NÃO há arrastar/redimensionar (preserva a fidelidade 1:1). O
// estado de visibilidade vem do useColumnPrefs (persiste por usuário). Estilo
// inline pra combinar com o resto da tela de fatura.

export interface ColMeta {
  id: string
  label: string
}

export default function ColumnVisibilityMenu({
  columns,
  isVisible,
  onToggle,
  onReset,
  style,
}: {
  columns: ColMeta[]
  isVisible: (id: string) => boolean
  onToggle: (id: string) => void
  onReset: () => void
  style?: CSSProperties
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <div style={{ position: 'relative', ...style }}>
      <button
        onClick={() => setAberto((a) => !a)}
        title="Mostrar ou esconder colunas"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
      >
        <SlidersHorizontal size={14} /> Colunas
      </button>
      {aberto && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setAberto(false)} />
          <div style={{ position: 'absolute', right: 0, marginTop: 4, zIndex: 20, width: 220, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)', padding: 8 }}>
            <p style={{ margin: 0, padding: '4px 8px', fontSize: 11, color: '#94a3b8' }}>Mostrar colunas</p>
            {columns.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={isVisible(c.id)} onChange={() => onToggle(c.id)} />
                <span>{c.label}</span>
              </label>
            ))}
            <button
              onClick={() => { onReset(); setAberto(false) }}
              style={{ width: '100%', textAlign: 'left', border: 'none', borderTop: '1px solid #f1f5f9', marginTop: 4, padding: '6px 8px', fontSize: 11, color: '#64748b', background: 'transparent', cursor: 'pointer' }}
            >
              Restaurar padrão
            </button>
          </div>
        </>
      )}
    </div>
  )
}
