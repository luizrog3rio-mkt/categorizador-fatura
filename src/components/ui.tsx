import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { X, Loader2, ArrowLeft } from 'lucide-react'
import type { EntryType } from '../lib/types'

/* ════════════════════════════════════════════════════════════════════════
   Design system "Razão Calma". Tokens em src/index.css (@theme).
   Cor só com função: revenue=entra, expense=sai, warning=alerta, brand=ação.
   ════════════════════════════════════════════════════════════════════════ */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-surface rounded-card border border-border shadow-card ${className}`}>
      {children}
    </div>
  )
}

export function PageHeader({
  titulo,
  subtitulo,
  acao,
  voltar,
  meta,
}: {
  titulo: string
  subtitulo?: string
  acao?: ReactNode
  voltar?: () => void
  meta?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        {voltar && (
          <button
            onClick={voltar}
            className="mt-1 text-fg-subtle hover:text-fg-muted rounded-control p-1"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold text-fg tracking-tight">{titulo}</h2>
            {meta}
          </div>
          {subtitulo && <p className="text-sm text-fg-muted mt-1">{subtitulo}</p>}
        </div>
      </div>
      {acao}
    </div>
  )
}

/* ── Badge: tom semântico (novo) + cor hex (legado, p/ TagSelector etc.) ── */
const tomBadge = {
  revenue: 'bg-revenue-bg text-revenue',
  expense: 'bg-expense-bg text-expense',
  warning: 'bg-warning-bg text-warning',
  brand: 'bg-brand-subtle text-brand',
  muted: 'bg-surface-2 text-muted',
} as const
export type BadgeTom = keyof typeof tomBadge

export function Badge({ children, tom, cor }: { children: ReactNode; tom?: BadgeTom; cor?: string }) {
  if (tom) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tomBadge[tom]}`}>
        {children}
      </span>
    )
  }
  // legado: cor hex livre (mantém callers antigos funcionando)
  const c = cor ?? '#64748b'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: c + '22', color: c }}
    >
      {children}
    </span>
  )
}

// status das entries (enum EN no banco, rótulo PT na UI)
// Fluxo: to_pay → pending → paid (ou cancelled/refunded)
const statusTom: Record<string, BadgeTom> = {
  to_pay: 'brand',     // cadastrado, aguardando
  pending: 'warning',  // enviado, aguardando aprovação
  paid: 'revenue',     // pago/recebido e confirmado
  cancelled: 'muted',  // cancelado
  refunded: 'muted',   // estornado
  overdue: 'expense',  // atrasado (legado)
}

const rotulosStatus: Record<string, string> = {
  to_pay: 'A pagar',
  pending: 'Pendente',
  paid: 'Pago',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
  overdue: 'Atrasado',
}

export function StatusBadge({ status, tipo }: { status: string; tipo?: EntryType }) {
  let rotulo = rotulosStatus[status] ?? status
  if (tipo === 'receivable') {
    if (status === 'to_pay') rotulo = 'A receber'
    else if (status === 'paid') rotulo = 'Recebido'
  }
  return <Badge tom={statusTom[status] ?? 'muted'}>{rotulo}</Badge>
}

/* ── KPICard: label + número tabular + caption. tom dá cor ao número. ──
   Use bare dentro de <KPIStrip> p/ a faixa segmentada do dashboard. */
const tomValor = {
  neutro: 'text-fg',
  revenue: 'text-revenue',
  expense: 'text-expense',
  warning: 'text-warning',
  brand: 'text-brand',
} as const
export type KpiTom = keyof typeof tomValor

// Variação % vs período anterior. goodWhen = a direção "boa" (receita sobe = bom;
// despesa sobe = ruim) → verde quando bom, vinho quando ruim, neutro quando ~0.
export function DeltaTag({
  pct,
  goodWhen = 'up',
  caption = 'vs mês anterior',
}: {
  pct: number
  goodWhen?: 'up' | 'down'
  caption?: string
}) {
  const arred = Math.round(pct * 10) / 10
  const dir = arred > 0 ? 'up' : arred < 0 ? 'down' : 'flat'
  const cor = dir === 'flat' ? 'text-fg-subtle' : dir === goodWhen ? 'text-revenue' : 'text-expense'
  const seta = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '→'
  return (
    <span className="inline-flex items-baseline gap-1 text-xs tnum">
      <span className={cor}>
        {seta} {Math.abs(arred).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
      </span>
      <span className="text-fg-subtle">{caption}</span>
    </span>
  )
}

export function KPICard({
  label,
  valor,
  tom = 'neutro',
  caption,
  delta,
  goodWhen,
  bare = false,
}: {
  label: string
  valor: ReactNode
  tom?: KpiTom
  caption?: string
  delta?: number | null // % vs período anterior; só renderiza quando finito
  goodWhen?: 'up' | 'down'
  bare?: boolean
}) {
  const temDelta = delta != null && Number.isFinite(delta)
  return (
    <div className={`bg-surface p-4 ${bare ? '' : 'rounded-card border border-border shadow-card'}`}>
      <p className="text-xs font-medium text-fg-subtle">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight tnum ${tomValor[tom]}`}>{valor}</p>
      {temDelta ? (
        <p className="mt-1"><DeltaTag pct={delta as number} goodWhen={goodWhen} /></p>
      ) : caption ? (
        <p className="mt-0.5 text-xs text-fg-subtle">{caption}</p>
      ) : null}
    </div>
  )
}

// Faixa de KPIs que lê como bloco único (gap-px revela a borda entre cards)
export function KPIStrip({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  const colCls = cols === 5 ? 'lg:grid-cols-5' : cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
  return (
    <div className={`grid grid-cols-2 ${colCls} gap-px bg-border rounded-card overflow-hidden border border-border shadow-card`}>
      {children}
    </div>
  )
}

export function Vazio({ mensagem }: { mensagem: string }) {
  return <p className="text-center text-fg-subtle py-10 text-sm">{mensagem}</p>
}

/* ── Alert: caixa de mensagem semântica (info/success/warning/danger) ── */
const tomAlert = {
  info: 'bg-brand-subtle',
  success: 'bg-revenue-bg',
  warning: 'bg-warning-bg',
  danger: 'bg-expense-bg',
} as const
export type AlertTom = keyof typeof tomAlert

export function Alert({ tom = 'info', titulo, children }: { tom?: AlertTom; titulo?: string; children?: ReactNode }) {
  return (
    <div className={`rounded-card border border-border px-4 py-3 text-sm text-fg-muted ${tomAlert[tom]}`}>
      {titulo && <p className="font-medium text-fg">{titulo}</p>}
      {children && <div className={titulo ? 'mt-1' : ''}>{children}</div>}
    </div>
  )
}

export function ErroBanner({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null
  return (
    <div className="mb-4 rounded-card border border-border bg-expense-bg text-expense text-sm px-4 py-3">
      {mensagem}
    </div>
  )
}

/* ── Button: variantes + loading. (btnPrimario/btnSecundario seguem como
   alias-string p/ migração incremental dos callers atuais.) ── */
const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-control text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none'
const btnTamanho = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2', icon: 'p-2' } as const
const btnVariante = {
  primary: 'bg-brand hover:bg-brand-strong text-white',
  secondary: 'bg-surface border border-border-strong hover:bg-surface-2 text-fg-muted',
  danger: 'bg-expense hover:brightness-95 text-white',
  ghost: 'text-fg-muted hover:bg-surface-2',
} as const

export function Button({
  variante = 'primary',
  tamanho = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: keyof typeof btnVariante
  tamanho?: keyof typeof btnTamanho
  loading?: boolean
}) {
  return (
    <button
      className={`${btnBase} ${btnTamanho[tamanho]} ${btnVariante[variante]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}

export const inputCls =
  'w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand'
export const btnPrimario =
  'inline-flex items-center gap-2 bg-brand hover:bg-brand-strong text-white text-sm font-medium rounded-control px-4 py-2 transition disabled:opacity-50'
export const btnSecundario =
  'inline-flex items-center gap-2 bg-surface border border-border-strong hover:bg-surface-2 text-fg-muted text-sm font-medium rounded-control px-4 py-2 transition'

export function Modal({
  titulo,
  aberto,
  onFechar,
  children,
  largura = 'lg',
  footer,
}: {
  titulo: string
  aberto: boolean
  onFechar: () => void
  children: ReactNode
  largura?: 'lg' | '2xl' | '4xl'
  footer?: ReactNode
}) {
  if (!aberto) return null
  const maxW = largura === '4xl' ? 'max-w-4xl' : largura === '2xl' ? 'max-w-2xl' : 'max-w-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-fg/40" onClick={onFechar} />
      <div className={`relative bg-surface rounded-modal shadow-pop w-full ${maxW} max-h-[90vh] flex flex-col`}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-fg">{titulo}</h3>
          <button
            onClick={onFechar}
            className="text-fg-subtle hover:text-fg-muted rounded-control p-1 -mr-1"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto min-h-0">{children}</div>
        {footer && (
          <div className="px-6 py-3 border-t border-border bg-surface-2 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  )
}
