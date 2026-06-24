import { useMemo, useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'

// Seletor de período (range de datas) com atalhos — substitui os dois inputs
// "de/até". Trabalha com strings 'YYYY-MM-DD' (mesmo formato do <input type=date>
// e das colunas date do banco). Datas manipuladas por componentes locais, sem
// toISOString, para não sofrer deslocamento de fuso.

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const fromYMD = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const mesmoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const fmtLongo = (d: Date) => `${String(d.getDate()).padStart(2, '0')} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`

function atalhos(): { label: string; range: () => [Date, Date] }[] {
  const n = new Date()
  const h = new Date(n.getFullYear(), n.getMonth(), n.getDate())
  const primeiroMes = (off: number) => new Date(h.getFullYear(), h.getMonth() + off, 1)
  const ultimoMes = (off: number) => new Date(h.getFullYear(), h.getMonth() + off + 1, 0)
  const dow = (h.getDay() + 6) % 7 // segunda = 0
  const seg = addDias(h, -dow)
  return [
    { label: 'Hoje', range: () => [h, h] },
    { label: 'Ontem', range: () => [addDias(h, -1), addDias(h, -1)] },
    { label: 'Últimos 7 dias', range: () => [addDias(h, -6), h] },
    { label: 'Últimos 14 dias', range: () => [addDias(h, -13), h] },
    { label: 'Últimos 30 dias', range: () => [addDias(h, -29), h] },
    { label: 'Esta semana', range: () => [seg, addDias(seg, 6)] },
    { label: 'Este mês', range: () => [primeiroMes(0), ultimoMes(0)] },
    { label: 'Mês passado', range: () => [primeiroMes(-1), ultimoMes(-1)] },
  ]
}

export default function DateRangePicker({ de, ate, onChange, align = 'left' }: { de: string; ate: string; onChange: (de: string, ate: string) => void; align?: 'left' | 'right' }) {
  const [aberto, setAberto] = useState(false)
  const [start, setStart] = useState<Date | null>(() => (de ? fromYMD(de) : null))
  const [end, setEnd] = useState<Date | null>(() => (ate ? fromYMD(ate) : null))
  const [hover, setHover] = useState<Date | null>(null)
  const [mesView, setMesView] = useState<Date>(() => {
    const b = de ? fromYMD(de) : new Date()
    return new Date(b.getFullYear(), b.getMonth(), 1)
  })

  const abrir = () => {
    setStart(de ? fromYMD(de) : null)
    setEnd(ate ? fromYMD(ate) : null)
    setHover(null)
    const b = de ? fromYMD(de) : new Date()
    setMesView(new Date(b.getFullYear(), b.getMonth(), 1))
    setAberto(true)
  }

  // computado a cada render (barato, 8 itens) p/ o "hoje" dos atalhos ser sempre
  // fresco — evita stale se a aba ficar aberta cruzando a meia-noite
  const ATALHOS = atalhos()

  const clicarDia = (d: Date) => {
    if (!start || (start && end)) {
      setStart(d); setEnd(null); setHover(null)
    } else {
      let s = start, e = d
      if (e < s) { const t = s; s = e; e = t }
      setStart(s); setEnd(e)
      onChange(toYMD(s), toYMD(e))
      setAberto(false)
    }
  }

  const aplicarAtalho = (r: [Date, Date]) => {
    setStart(r[0]); setEnd(r[1])
    onChange(toYMD(r[0]), toYMD(r[1]))
    setAberto(false)
  }

  const limpar = () => { setStart(null); setEnd(null); onChange('', ''); setAberto(false) }

  const ano = mesView.getFullYear()
  const mes = mesView.getMonth()
  const celulas = useMemo<(Date | null)[]>(() => {
    const primeiro = new Date(ano, mes, 1)
    const offset = (primeiro.getDay() + 6) % 7
    const total = new Date(ano, mes + 1, 0).getDate()
    return [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => new Date(ano, mes, i + 1))]
  }, [ano, mes])

  const fim = end ?? hover
  const classeDia = (d: Date) => {
    // cantos calculados a partir dos extremos ORDENADOS (lo/hi), p/ o highlight
    // ficar correto inclusive no hover "para trás" (hover anterior ao start)
    const lo = start && fim ? (start <= fim ? start : fim) : start
    const hi = start && fim ? (start <= fim ? fim : start) : start
    const ehLo = lo && mesmoDia(d, lo)
    const ehHi = hi && mesmoDia(d, hi)
    const noRange = !!(lo && hi && d >= lo && d <= hi)
    let c = 'h-9 text-sm flex items-center justify-center cursor-pointer select-none tnum '
    if (ehLo && ehHi) c += 'bg-brand text-white font-semibold rounded-control'
    else if (ehLo) c += 'bg-brand text-white font-semibold rounded-l-control'
    else if (ehHi) c += 'bg-brand text-white font-semibold rounded-r-control'
    else if (noRange) c += 'bg-brand-subtle text-brand'
    else c += 'text-fg-muted hover:bg-canvas rounded-control'
    return c
  }

  const texto = de && ate
    ? `${fmtLongo(fromYMD(de))} — ${fmtLongo(fromYMD(ate))}`
    : de ? `A partir de ${fmtLongo(fromYMD(de))}`
    : ate ? `Até ${fmtLongo(fromYMD(ate))}`
    : 'Selecionar período'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        className="inline-flex items-center gap-2 rounded-control border border-border-strong bg-surface px-3 py-2 text-sm hover:bg-surface-2"
      >
        <CalendarIcon size={15} className="text-brand shrink-0" />
        <span className={de || ate ? 'text-fg-muted' : 'text-fg-subtle'}>{texto}</span>
        <ChevronDown size={15} className="text-fg-subtle shrink-0" />
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-40 mt-2 flex rounded-card border border-border bg-surface shadow-pop`}>
            <div className="w-40 shrink-0 border-r border-border py-2">
              <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Atalhos</p>
              {ATALHOS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => aplicarAtalho(a.range())}
                  className="block w-full px-4 py-1.5 text-left text-sm text-fg-muted hover:bg-brand-subtle hover:text-brand"
                >
                  {a.label}
                </button>
              ))}
            </div>

            <div className="w-[296px] p-3">
              <div className="flex items-center justify-between px-1 pb-2">
                <button type="button" onClick={() => setMesView(new Date(ano, mes - 1, 1))} className="rounded-control p-1 text-fg-subtle hover:bg-canvas hover:text-fg-muted">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-semibold text-fg-muted">{MESES[mes]} {ano}</span>
                <button type="button" onClick={() => setMesView(new Date(ano, mes + 1, 1))} className="rounded-control p-1 text-fg-subtle hover:bg-canvas hover:text-fg-muted">
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7" onMouseLeave={() => { if (start && !end) setHover(null) }}>
                {DIAS.map((d) => (
                  <span key={d} className="py-1 text-center text-[11px] font-medium text-fg-subtle">{d}</span>
                ))}
                {celulas.map((d, i) =>
                  d ? (
                    <div
                      key={i}
                      onClick={() => clicarDia(d)}
                      onMouseEnter={() => start && !end && setHover(d)}
                      className={classeDia(d)}
                    >
                      {d.getDate()}
                    </div>
                  ) : (
                    <span key={i} />
                  )
                )}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                <button type="button" onClick={limpar} className="text-xs text-fg-muted hover:text-expense">
                  Limpar
                </button>
                <button type="button" onClick={() => setAberto(false)} className="text-xs font-medium text-brand hover:text-brand-strong">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
