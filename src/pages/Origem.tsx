import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtBRL } from '../lib/format'
import { Card, PageHeader, ErroBanner, KPICard, KPIStrip, inputCls, Vazio } from '../components/ui'

// De-para canal → origem (Orgânico / Tráfego / Comercial). O canal-base é o 1º
// segmento do `src` do tracking (purchase.tracking.source); quando a venda não tem
// `src`, cai no `sck` (mesmo tratamento) — exceto se o sck for de vendedor. A origem
// é DERIVADA ao vivo pela view hotmart_sales_origin (sem coluna na venda) — remapear
// reclassifica tudo na hora. Espelha a tela /vendedores (sck → vendedor). Precedência
// da view: canal(src) > vendedor(sck) → comercial > canal(sck) > 'a_classificar'. As
// vendas sem src nem sck ficam permanentemente em "A classificar" (teto estrutural).

interface CanalRow {
  canal: string
  vendas: number
  bruto: number
  liquido: number
  origem: string | null
  sugestao: string | null
  is_ruido: boolean
}

interface OrigemTotal {
  origem: string
  vendas: number
  bruto: number
  total: number
  liquido: number
}

const ORIGENS = [
  { valor: 'organico', rotulo: 'Orgânico' },
  { valor: 'trafego', rotulo: 'Tráfego' },
  { valor: 'comercial', rotulo: 'Comercial' },
] as const

export default function Origem() {
  const [canais, setCanais] = useState<CanalRow[]>([])
  const [totais, setTotais] = useState<OrigemTotal[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [soNaoMapeados, setSoNaoMapeados] = useState(false)
  const [esconderRuido, setEsconderRuido] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const [r1, r2] = await Promise.all([
      supabase.rpc('hotmart_channels'),
      supabase.rpc('hotmart_by_origin', { p_company: null, p_start: null, p_end: null }),
    ])
    if (r1.error) setErro('Erro ao carregar os canais: ' + r1.error.message)
    else setCanais(((r1.data as CanalRow[]) ?? []).map((c) => ({
      ...c, vendas: Number(c.vendas), bruto: Number(c.bruto), liquido: Number(c.liquido),
    })))
    if (r2.error) setErro('Erro ao carregar os totais: ' + r2.error.message)
    else setTotais(((r2.data as OrigemTotal[]) ?? []).map((o) => ({
      ...o, vendas: Number(o.vendas), bruto: Number(o.bruto), total: Number(o.total), liquido: Number(o.liquido),
    })))
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // upsert por canal (mesma estratégia do setVendedor em Vendedores); "— sem origem —" remove do mapa
  const setOrigem = async (canal: string, origem: string | null) => {
    setCanais((prev) => prev.map((r) => (r.canal === canal ? { ...r, origem } : r)))
    const { error } = origem
      ? await supabase.from('hotmart_origin_map').upsert({ canal, origem, updated_at: new Date().toISOString() }, { onConflict: 'canal' })
      : await supabase.from('hotmart_origin_map').delete().eq('canal', canal)
    if (error) { setErro('Erro ao salvar a origem: ' + error.message); carregar() }
    else carregarTotais()
  }

  // só os totais (os KPIs mexem a cada mapeamento; a tabela já é otimista)
  const carregarTotais = useCallback(async () => {
    const { data, error } = await supabase.rpc('hotmart_by_origin', { p_company: null, p_start: null, p_end: null })
    if (!error) setTotais(((data as OrigemTotal[]) ?? []).map((o) => ({
      ...o, vendas: Number(o.vendas), bruto: Number(o.bruto), total: Number(o.total), liquido: Number(o.liquido),
    })))
  }, [])

  const porOrigem = useMemo(() => {
    const m = new Map<string, OrigemTotal>()
    totais.forEach((o) => m.set(o.origem, o))
    return m
  }, [totais])

  const kpi = (origem: string) => {
    const o = porOrigem.get(origem)
    return o ? `${o.vendas} · ${fmtBRL(o.liquido)}` : '0 · —'
  }

  const exibidos = useMemo(() => {
    let l = canais
    if (esconderRuido) l = l.filter((r) => !r.is_ruido)
    if (soNaoMapeados) l = l.filter((r) => !r.origem)
    return l
  }, [canais, esconderRuido, soNaoMapeados])

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Origem das vendas"
        subtitulo="Classifique cada canal de tracking (o 1º trecho do src — ou do sck quando não há src) como Orgânico, Tráfego ou Comercial — as vendas herdam a origem do canal, sem mexer venda a venda"
      />

      <ErroBanner mensagem={erro} />

      {/* Total por origem (derivado ao vivo da view) */}
      <KPIStrip cols={4}>
        <KPICard bare label="Orgânico" valor={kpi('organico')} tom="revenue" />
        <KPICard bare label="Tráfego" valor={kpi('trafego')} tom="neutro" />
        <KPICard bare label="Comercial" valor={kpi('comercial')} tom="neutro" />
        <KPICard bare label="A classificar" valor={kpi('a_classificar')} tom={porOrigem.get('a_classificar') ? 'warning' : 'neutro'} />
      </KPIStrip>

      {/* de-para canal → origem */}
      <Card>
        <div className="flex items-center justify-between gap-3 p-3 border-b border-border flex-wrap">
          <p className="text-sm text-fg-muted">{exibidos.length} canal{exibidos.length !== 1 ? 'is' : ''}</p>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
              <input type="checkbox" className="accent-brand" checked={esconderRuido} onChange={(e) => setEsconderRuido(e.target.checked)} />
              Esconder ruído
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
              <input type="checkbox" className="accent-brand" checked={soNaoMapeados} onChange={(e) => setSoNaoMapeados(e.target.checked)} />
              Só os a classificar
            </label>
          </div>
        </div>

        {carregando ? (
          <Vazio mensagem="Carregando…" />
        ) : exibidos.length === 0 ? (
          <Vazio mensagem="Nenhum canal. As vendas com tracking (src ou sck) aparecem aqui conforme o sync preenche o histórico." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead>
                <tr className="border-b border-border text-xs text-fg-subtle uppercase tracking-wide">
                  <th className="text-left px-4 h-10 font-medium">Canal</th>
                  <th className="text-right px-4 h-10 font-medium">Vendas</th>
                  <th className="text-right px-4 h-10 font-medium">Líquido</th>
                  <th className="text-left px-4 h-10 font-medium w-64">Origem</th>
                </tr>
              </thead>
              <tbody>
                {exibidos.map((r) => (
                  <tr
                    key={r.canal}
                    className={`border-b border-border last:border-0 hover:bg-surface-2 ${!r.origem && !r.is_ruido ? 'bg-warning-bg/40' : ''}`}
                  >
                    <td className="px-4 py-2 text-fg">
                      <span className="break-all">{r.canal}</span>
                      {r.is_ruido && <span className="ml-2 text-[10px] text-fg-subtle uppercase tracking-wide">ruído</span>}
                      {!r.origem && r.sugestao && (
                        <span className="ml-2 text-[10px] text-brand uppercase tracking-wide">sugestão: {r.sugestao}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-fg-muted">{r.vendas}</td>
                    <td className="px-4 py-2 text-right font-medium text-fg">{fmtBRL(r.liquido)}</td>
                    <td className="px-4 py-2">
                      <select
                        className={inputCls + (!r.origem && !r.is_ruido ? ' border-warning' : '')}
                        value={r.origem ?? ''}
                        onChange={(e) => setOrigem(r.canal, e.target.value || null)}
                      >
                        <option value="">— sem origem —</option>
                        {ORIGENS.map((o) => (
                          <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
