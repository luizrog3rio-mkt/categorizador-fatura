import { useEffect, useRef, useState } from 'react'
import { Download, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react'
import { exportCSV, exportXLSX } from '../../lib/exportFatura'

interface TxView {
  id: string
  date: string
  memo: string
  amount: number // magnitude positiva; o sinal vem de kind
  category: string | null
  auto: boolean
  kind: 'debit' | 'credit'
}

// Menu de export — distingue "filtrados (N)" vs "todos (N)"; comportamento
// preservado (contrato #14): busca ativa + "exportar todos" ignora a busca,
// como no app antigo. Só o visual foi padronizado (Tailwind/lucide).
export default function ExportMenu({
  transactions,
  filtered,
  filter,
}: {
  transactions: TxView[]
  filtered: TxView[]
  filter: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const isFiltered = filter !== 'all'
  const exportTarget = isFiltered ? filtered : transactions
  const label = isFiltered ? `filtrados (${filtered.length})` : `todos (${transactions.length})`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={transactions.length === 0}
        className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg px-4 py-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download size={16} /> Exportar <ChevronDown size={14} className="opacity-60" />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-[9999] min-w-60 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="px-4 pt-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Exportar {label}</div>
          <ExportOption Icon={FileSpreadsheet} label="Excel (.xlsx)" sub="Abre direto no Excel" onClick={() => { exportXLSX(exportTarget).catch(console.error); setOpen(false) }} />
          <ExportOption Icon={FileText} label="CSV (.csv)" sub="Compatível com qualquer app" onClick={() => { exportCSV(exportTarget); setOpen(false) }} />
          {isFiltered && (
            <>
              <div className="h-px bg-slate-100 my-1" />
              <div className="px-4 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Exportar todos ({transactions.length})</div>
              <ExportOption Icon={FileSpreadsheet} label="Excel (.xlsx)" onClick={() => { exportXLSX(transactions).catch(console.error); setOpen(false) }} compact />
              <ExportOption Icon={FileText} label="CSV (.csv)" onClick={() => { exportCSV(transactions); setOpen(false) }} compact />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ExportOption({
  Icon,
  label,
  sub,
  onClick,
  compact = false,
}: {
  Icon: typeof FileText
  label: string
  sub?: string
  onClick: () => void
  compact?: boolean
}) {
  return (
    <div onClick={onClick} className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-slate-50">
      <Icon size={compact ? 16 : 18} className="text-slate-500 shrink-0" />
      <div>
        <div className={`text-sm ${compact ? 'font-medium text-slate-600' : 'font-bold text-slate-800'}`}>{label}</div>
        {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
      </div>
    </div>
  )
}

export type { TxView }
