import { BarChart3 } from 'lucide-react'
import { CAT_CHART_COLORS, TAG_COLORS, fmt, valorComSinal, type CatUI, type TagColor } from '../../lib/fatura'
import { Card, KPICard, KPIStrip } from '../ui'
import type { TxView } from './ExportMenu'

// Dashboard por fatura (KPIs + ranking + donut com drill-down: clicar numa
// categoria filtra e leva pra aba Lançamentos). Padronizado no design system
// (Card + Tailwind); o donut continua SVG próprio com as cores CAT_CHART_COLORS.

interface EntryAgg {
  cat: string
  total: number
  count: number
  pct: number
  chartColor: string
  tagColor: TagColor
  start?: number
  end?: number
}

function DonutChart({ entries, grandTotal }: { entries: EntryAgg[]; grandTotal: number }) {
  const size = 150, cx = 75, cy = 75, r = 56, inner = 34
  if (!grandTotal) return null

  // cumulativo sem reassinalar variável durante o render (regra do React 19)
  const ends = entries.reduce<number[]>((acc, e) => [...acc, (acc[acc.length - 1] ?? 0) + e.pct / 100], [])
  const slices = entries.map((e, i) => ({ ...e, start: i === 0 ? 0 : ends[i - 1], end: ends[i] }))

  const pt = (pct: number, radius: number) => {
    const a = pct * 2 * Math.PI - Math.PI / 2
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) }
  }

  return (
    <svg width={size} height={size} className="shrink-0">
      {slices.map((s, i) => {
        if (s.end - s.start < 0.001) return null
        const s1 = pt(s.start, r), s2 = pt(s.end, r)
        const i1 = pt(s.start, inner), i2 = pt(s.end, inner)
        const large = s.end - s.start > 0.5 ? 1 : 0
        const d = `M ${i1.x} ${i1.y} L ${s1.x} ${s1.y} A ${r} ${r} 0 ${large} 1 ${s2.x} ${s2.y} L ${i2.x} ${i2.y} A ${inner} ${inner} 0 ${large} 0 ${i1.x} ${i1.y} Z`
        return <path key={i} d={d} fill={s.chartColor} stroke="#fff" strokeWidth={1.5} />
      })}
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight={700} letterSpacing="0.05em">TOTAL</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fontSize={10} fill="#0f172a" fontWeight={800}>{fmt(grandTotal)}</text>
    </svg>
  )
}

export default function FaturaDashboard({
  transactions,
  categories,
  onFilterClick,
}: {
  transactions: TxView[]
  categories: CatUI[]
  onFilterClick: (cat: string) => void
}) {
  const grandTotal = transactions.reduce((s, t) => s + valorComSinal(t), 0)
  const semCat = transactions.filter((t) => !t.category).length
  const ticket = transactions.length > 0 ? grandTotal / transactions.length : 0

  const byCategory: Record<string, { total: number; count: number }> = {}
  transactions.forEach((t) => {
    const key = t.category || 'Sem categoria'
    if (!byCategory[key]) byCategory[key] = { total: 0, count: 0 }
    byCategory[key].total += valorComSinal(t)
    byCategory[key].count += 1
  })

  const entries: EntryAgg[] = Object.entries(byCategory)
    .map(([cat, d]) => {
      const colorIdx = categories.findIndex((c) => c.name === cat)
      const tagColor = colorIdx >= 0 ? categories[colorIdx].color : TAG_COLORS[9]
      const chartColor = CAT_CHART_COLORS[colorIdx >= 0 ? colorIdx % CAT_CHART_COLORS.length : 8]
      return { cat, total: d.total, count: d.count, pct: grandTotal > 0 ? (d.total / grandTotal) * 100 : 0, chartColor, tagColor }
    })
    .sort((a, b) => b.total - a.total)

  const maxVal = entries[0]?.total || 1

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-fg-subtle">
        <BarChart3 size={40} className="mb-3" />
        <p className="text-sm">Importe uma fatura para ver o dashboard</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <KPIStrip cols={4}>
          <KPICard bare label="Total gasto" valor={fmt(grandTotal)} tom="expense" caption={`${transactions.length} lançamentos`} />
          <KPICard bare label="Maior categoria" valor={entries[0] ? fmt(entries[0].total) : '—'} caption={`${entries[0]?.cat || '—'} · ${entries[0]?.pct.toFixed(1) || 0}%`} />
          <KPICard bare label="Ticket médio" valor={fmt(ticket)} caption="por lançamento" />
          <KPICard bare label="Sem categoria" valor={String(semCat)} tom={semCat === 0 ? 'revenue' : 'warning'} caption={semCat === 0 ? 'tudo categorizado ✓' : `de ${transactions.length} lançamentos`} />
        </KPIStrip>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6 items-start">
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-baseline gap-2">
            <span className="font-bold text-sm text-fg">Ranking por categoria</span>
            <span className="text-xs text-fg-subtle">clique para ver os lançamentos</span>
          </div>
          {entries.map((e) => (
            <div
              key={e.cat}
              onClick={() => onFilterClick(e.cat)}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-surface-2"
            >
              <span
                className="inline-block px-2.5 py-1 rounded-full text-xs font-bold w-28 text-center truncate shrink-0 border"
                style={{ background: e.tagColor.bg, color: e.tagColor.text, borderColor: e.tagColor.border }}
              >
                {e.cat}
              </span>
              <div className="flex-1 h-2 bg-canvas rounded overflow-hidden">
                <div className="h-full rounded transition-[width] duration-500" style={{ background: e.chartColor, width: `${(e.total / maxVal) * 100}%` }} />
              </div>
              <span className="text-xs text-fg-subtle w-10 text-right shrink-0 tnum">{e.pct.toFixed(1)}%</span>
              <span className="text-sm font-bold text-fg w-[110px] text-right shrink-0 tnum">{fmt(e.total)}</span>
              <span className="text-xs text-fg-subtle w-12 text-right shrink-0 tnum">{e.count} lanç.</span>
            </div>
          ))}
        </Card>

        <Card className="p-4 min-w-56">
          <div className="font-bold text-sm text-fg mb-3.5">Distribuição</div>
          <div className="flex justify-center mb-4">
            <DonutChart entries={entries} grandTotal={grandTotal} />
          </div>
          <div className="flex flex-col gap-1.5">
            {entries.map((e) => (
              <div
                key={e.cat}
                onClick={() => onFilterClick(e.cat)}
                className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition"
              >
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: e.chartColor }} />
                <span className="text-xs text-fg-muted flex-1 truncate">{e.cat}</span>
                <span className="text-xs text-fg-subtle font-semibold shrink-0 tnum">{e.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
