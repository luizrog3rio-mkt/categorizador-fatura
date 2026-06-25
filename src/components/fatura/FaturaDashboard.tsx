import { BarChart3 } from 'lucide-react'
import { fmt, valorComSinal } from '../../lib/fatura'
import { KPICard, KPIStrip } from '../ui'
import type { TxView } from './ExportMenu'

// Dashboard por fatura (slim): Total gasto + Ticket médio. O recorte por
// categoria (ranking + donut + drill-down) foi removido em 2026-06-25.
export default function FaturaDashboard({ transactions }: { transactions: TxView[] }) {
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

  return (
    <KPIStrip cols={2}>
      <KPICard bare label="Total gasto" valor={fmt(grandTotal)} tom="expense" caption={`${transactions.length} lançamentos`} />
      <KPICard bare label="Ticket médio" valor={fmt(ticket)} caption="por lançamento" />
    </KPIStrip>
  )
}
