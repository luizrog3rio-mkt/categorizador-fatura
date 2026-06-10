export const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtData = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Data local (NÃO usar toISOString: é UTC e perto da meia-noite BRT vira o dia seguinte)
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const hoje = () => isoLocal(new Date())

export const primeiroDiaMes = (d = new Date()) => isoLocal(new Date(d.getFullYear(), d.getMonth(), 1))

export const ultimoDiaMes = (d = new Date()) => isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0))
