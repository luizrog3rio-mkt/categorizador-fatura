import type { ReactNode } from 'react'
import type { EntryType } from '../lib/types'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${className}`}>
      {children}
    </div>
  )
}

export function PageHeader({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string
  subtitulo?: string
  acao?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{titulo}</h2>
        {subtitulo && <p className="text-sm text-slate-500 mt-1">{subtitulo}</p>}
      </div>
      {acao}
    </div>
  )
}

export function Badge({ children, cor }: { children: ReactNode; cor: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: cor + '22', color: cor }}
    >
      {children}
    </span>
  )
}

// status das entries (enum EN no banco, rótulo PT na UI)
// Fluxo: to_pay → pending → paid  (ou cancelled em qualquer etapa)
const coresStatus: Record<string, string> = {
  to_pay: '#3b82f6',    // azul  — cadastrado, aguardando envio
  pending: '#f59e0b',   // âmbar — enviado, aguardando aprovação
  paid: '#22c55e',      // verde — pago e confirmado
  cancelled: '#94a3b8', // cinza — cancelado
  overdue: '#ef4444',   // vermelho — legado (não usado no fluxo novo)
}

const rotulosStatus: Record<string, string> = {
  to_pay: 'A pagar',
  pending: 'Pendente',
  paid: 'Pago',
  cancelled: 'Cancelado',
  overdue: 'Atrasado',
}

export function StatusBadge({ status, tipo }: { status: string; tipo?: EntryType }) {
  const cor = coresStatus[status] ?? '#64748b'
  let rotulo = rotulosStatus[status] ?? status
  if (tipo === 'receivable') {
    if (status === 'to_pay') rotulo = 'A receber'
    else if (status === 'paid') rotulo = 'Recebido'
  }
  return <Badge cor={cor}>{rotulo}</Badge>
}

export function Vazio({ mensagem }: { mensagem: string }) {
  return <p className="text-center text-slate-400 py-10 text-sm">{mensagem}</p>
}

export function ErroBanner({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
      {mensagem}
    </div>
  )
}

export const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
export const btnPrimario =
  'inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition disabled:opacity-50'
export const btnSecundario =
  'inline-flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg px-4 py-2 transition'

export function Modal({
  titulo,
  aberto,
  onFechar,
  children,
  largura = 'lg',
}: {
  titulo: string
  aberto: boolean
  onFechar: () => void
  children: ReactNode
  largura?: 'lg' | '2xl' | '4xl'
}) {
  if (!aberto) return null
  const maxW = largura === '4xl' ? 'max-w-4xl' : largura === '2xl' ? 'max-w-2xl' : 'max-w-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onFechar} />
      <div className={`relative bg-white rounded-2xl shadow-xl w-full ${maxW} max-h-[90vh] overflow-y-auto`}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">{titulo}</h3>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
