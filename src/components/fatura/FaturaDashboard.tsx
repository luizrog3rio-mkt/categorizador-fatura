import { BarChart3 } from 'lucide-react'
import { fmt, valorComSinal } from '../../lib/fatura'
import { Card, KPICard, KPIStrip } from '../ui'
import type { TxView } from './ExportMenu'
import type { ChartOfAccount } from '../../lib/types'

// Dashboard por fatura: KPIs (total/ticket/a-classificar) + um bloco único com
// "Por natureza" (composição) e "Gasto por Plano de Contas" (ranking, com
// drill-down que filtra a tabela). Usa o sinal contábil (valorComSinal: débito
// soma, crédito abate). Espelha o recorte por categoria do app antigo, por conta.

const CHART_COLORS = [
  '#534AB7', '#D4537E', '#D85A30', '#1D9E75', '#378ADD',
  '#BA7517', '#3B6D11', '#E24B4A', '#888780', '#075985',
]
const NEUTRO = '#cbd5e1'
const SEM = '__sem_conta__' // sentinela do filtro "sem conta"

const NATURE_LABELS: Record<string, string> = {
  revenue: 'Receita', deduction: 'Dedução', variable_cost: 'Custo Variável',
  fixed_cost: 'Custo Fixo', financial: 'Financeiro', depreciation: 'Depreciação', tax: 'Impostos s/ Lucro',
}
const NATURE_COLORS: Record<string, string> = {
  revenue: '#22c55e', deduction: '#f97316', variable_cost: '#eab308',
  fixed_cost: '#ef4444', financial: '#3b82f6', depreciation: '#94a3b8', tax: '#8b5cf6',
}

type Agg = { key: string; id: string | null; label: string; nature: string | null; total: number; count: number }

export default function FaturaDashboard({
  transactions, chartAccounts, contaFiltro, onSelecionarConta,
}: {
  transactions: TxView[]
  chartAccounts: ChartOfAccount[]
  contaFiltro: string | null
  onSelecionarConta: (v: string | null) => void
}) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-fg-subtle">
        <BarChart3 size={40} className="mb-3" />
        <p className="text-sm">Importe uma fatura para ver o dashboard</p>
      </div>
    )
  }

  const grandTotal = transactions.reduce((s, t) => s + valorComSinal(t), 0)
  const ticket = grandTotal / transactions.length

  // agrega por conta do plano (null = sem conta)
  const accMap = new Map(chartAccounts.map((c) => [c.id, c]))
  const map = new Map<string, Agg>()
  for (const t of transactions) {
    const id = t.chart_of_account_id ?? null
    const key = id ?? SEM
    const acc = id ? accMap.get(id) : undefined
    const label = acc ? `${acc.code} – ${acc.name}` : '(sem conta)'
    const cur = map.get(key) ?? { key, id, label, nature: acc?.nature ?? null, total: 0, count: 0 }
    cur.total += valorComSinal(t)
    cur.count++
    map.set(key, cur)
  }
  const semConta = map.get(SEM) ?? null
  const contas = [...map.values()].filter((a) => a.key !== SEM).sort((a, b) => b.total - a.total)
  const totalClass = contas.reduce((s, a) => s + a.total, 0)
  const maxVal = contas.reduce((m, a) => Math.max(m, a.total), 0) || 1
  const slices = contas
    .filter((a) => a.total > 0)
    .map((a, i) => ({ ...a, color: CHART_COLORS[i % CHART_COLORS.length], pct: totalClass > 0 ? (a.total / totalClass) * 100 : 0 }))

  // agrega por natureza (só classificados)
  const natMap = new Map<string, number>()
  contas.forEach((a) => { if (a.nature) natMap.set(a.nature, (natMap.get(a.nature) ?? 0) + a.total) })
  const naturezas = [...natMap.entries()].map(([nat, total]) => ({ nat, total })).filter((n) => n.total > 0).sort((a, b) => b.total - a.total)
  const totalNat = naturezas.reduce((s, n) => s + n.total, 0) || 1

  // linhas do ranking = contas coloridas + (sem conta) no fim, se houver
  const linhas = [
    ...slices,
    ...(semConta && semConta.count ? [{ ...semConta, color: NEUTRO, pct: 0 }] : []),
  ]

  return (
    <div className="space-y-4">
      <KPIStrip cols={3}>
        <KPICard bare label="Total gasto" valor={fmt(grandTotal)} tom="expense" caption={`${transactions.length} lançamentos`} />
        <KPICard bare label="Ticket médio" valor={fmt(ticket)} caption="por lançamento" />
        <KPICard
          bare label="A classificar" valor={semConta?.count ?? 0}
          tom={semConta?.count ? 'warning' : 'revenue'}
          caption={semConta?.count ? 'sem conta do plano' : 'tudo classificado'}
        />
      </KPIStrip>

      {contas.length === 0 ? (
        <Card className="p-4 text-sm text-fg-subtle text-center">
          Classifique os lançamentos abaixo (coluna <span className="text-fg-muted">Plano de Contas</span>) pra ver o gasto por conta.
        </Card>
      ) : (
        // mesmo bloco (um card): ranking em cima, "Por natureza" embaixo
        <Card className="p-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-fg mb-4">Gasto por Plano de Contas</h3>
            <div>
              {linhas.map((a, i) => {
                const ativo = (a.key === SEM && contaFiltro === SEM) || (!!a.id && contaFiltro === a.id)
                return (
                  <button
                    key={a.key}
                    onClick={() => onSelecionarConta(ativo ? null : (a.id ?? SEM))}
                    className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-control text-left transition hover:bg-surface-2 ${ativo ? 'bg-brand-subtle' : ''}`}
                    title={`Filtrar a tabela por ${a.label}`}
                  >
                    <span className="w-4 text-xs text-fg-subtle tnum">{a.key === SEM ? '·' : i + 1}</span>
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
                    <span className="w-72 lg:w-80 shrink-0 truncate text-sm text-fg">{a.label}</span>
                    <div className="hidden sm:block flex-1 min-w-[60px] h-2 rounded bg-surface-2 overflow-hidden">
                      <div className="h-full rounded" style={{ background: a.color, width: `${a.key === SEM ? 100 : (a.total / maxVal) * 100}%` }} />
                    </div>
                    <span className="w-10 text-right text-xs text-fg-subtle tnum hidden sm:block">{a.key === SEM ? '' : `${a.pct.toFixed(0)}%`}</span>
                    <span className="w-24 text-right text-sm font-medium text-fg tnum">{fmt(a.total)}</span>
                    <span className="w-14 text-right text-xs text-fg-subtle tnum">{a.count} lanç.</span>
                  </button>
                )
              })}
            </div>
          </div>

          {naturezas.length > 0 && (
            <div className="border-t border-border pt-5">
              <h3 className="text-sm font-semibold text-fg mb-3">Por natureza</h3>
              <div className="flex h-3 rounded-full overflow-hidden mb-3">
                {naturezas.map((n) => (
                  <div key={n.nat} style={{ background: NATURE_COLORS[n.nat] ?? NEUTRO, width: `${(n.total / totalNat) * 100}%` }} title={NATURE_LABELS[n.nat] ?? n.nat} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {naturezas.map((n) => (
                  <div key={n.nat} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: NATURE_COLORS[n.nat] ?? NEUTRO }} />
                    <span className="text-fg-muted">{NATURE_LABELS[n.nat] ?? n.nat}</span>
                    <span className="text-fg font-medium tnum">{fmt(n.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
