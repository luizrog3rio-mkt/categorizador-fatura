import { Hammer } from 'lucide-react'
import { Card, PageHeader } from '../components/ui'

export default function EmConstrucao({ titulo, etapa }: { titulo: string; etapa: string }) {
  return (
    <div>
      <PageHeader titulo={titulo} />
      <Card className="p-10 text-center text-slate-400">
        <Hammer className="mx-auto mb-3" size={28} />
        <p className="text-sm">
          Em construção — {etapa} do plano da Fase 2.
        </p>
      </Card>
    </div>
  )
}
