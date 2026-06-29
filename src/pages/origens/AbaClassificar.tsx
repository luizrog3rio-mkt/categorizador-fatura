import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../contexts/AppContext'
import { Card, ErroBanner, Vazio, Button } from '../../components/ui'
import RegraModal from '../../components/RegraModal'
import { REGRA_VAZIA, type NovaRegra } from '../../lib/regra'

// Aba "A classificar" da página Origens (era a tela /classificar). ORIENTADA A
// VALORES (não a linhas): lista os VALORES DISTINTOS de src/sck/afiliado entre as
// vendas a classificar, por volume (RPC origin_unmapped_values). Cada valor vira 1
// regra (RegraModal compartilhado) que propaga no servidor.

type Dim = 'src' | 'sck' | 'afiliado'
const DIMS: { key: Dim; rotulo: string }[] = [
  { key: 'src', rotulo: 'src' },
  { key: 'sck', rotulo: 'sck' },
  { key: 'afiliado', rotulo: 'Afiliado' },
]
const campoDaDim: Record<Dim, keyof NovaRegra> = { src: 'src_value', sck: 'sck_value', afiliado: 'afiliado_value' }
const fmtInt = (n: number) => new Intl.NumberFormat('pt-BR').format(n)

interface Grupo { id: string; nome: string }
interface SellerLite { id: string; name: string }
interface Valor { valor: string; qtd: number }

export default function AbaClassificar() {
  const { empresaAtiva } = useApp()
  const [dim, setDim] = useState<Dim>('src')
  const [valores, setValores] = useState<Valor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [vendedores, setVendedores] = useState<SellerLite[]>([])
  const [modal, setModal] = useState<{ inicial: NovaRegra; valor: string; qtd: number } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null)
    const { data, error } = await supabase.rpc('origin_unmapped_values', { p_field: dim, p_company: empresaAtiva?.id ?? null })
    if (error) setErro('Erro ao carregar valores: ' + error.message)
    else setValores(((data as Valor[]) ?? []).map((v) => ({ valor: v.valor, qtd: Number(v.qtd) })))
    setCarregando(false)
  }, [dim, empresaAtiva])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    supabase.from('origin_groups').select('id,nome').order('nome').then(({ data }) => setGrupos((data as Grupo[]) ?? []))
    supabase.from('sellers').select('id,name').eq('active', true).order('name').then(({ data }) => setVendedores((data as SellerLite[]) ?? []))
  }, [])

  const abrirCriar = (v: Valor) => {
    setModal({ inicial: { ...REGRA_VAZIA, [campoDaDim[dim]]: v.valor }, valor: v.valor, qtd: v.qtd })
  }

  const totalVendas = useMemo(() => valores.reduce((s, v) => s + v.qtd, 0), [valores])
  const max = valores[0]?.qtd ?? 1
  const cauda = useMemo(() => valores.filter((v) => v.qtd === 1).length, [valores])
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? valores.filter((v) => v.valor.toLowerCase().includes(q)) : valores
  }, [valores, busca])

  return (
    <div className="space-y-6">
      <ErroBanner mensagem={erro} />

      <Card>
        <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-1">
            {DIMS.map((d) => (
              <button
                key={d.key}
                onClick={() => { setDim(d.key); setBusca('') }}
                className={`px-3 py-1 rounded-control text-xs font-medium transition ${dim === d.key ? 'bg-brand text-white' : 'bg-surface-2 text-fg-muted hover:bg-border'}`}
              >
                {d.rotulo}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {!carregando && (
              <span className="text-xs text-fg-subtle tnum">
                {fmtInt(valores.length)} valores · {fmtInt(totalVendas)} vendas a classificar
              </span>
            )}
            <input
              className="rounded-control border border-border bg-surface px-3 py-1 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand w-48"
              placeholder="Filtrar valor..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        {carregando ? (
          <Vazio mensagem="Carregando…" />
        ) : lista.length === 0 ? (
          <Vazio mensagem={busca.trim() ? 'Nenhum valor para esse filtro.' : 'Nada a classificar nesta dimensão. 🎉'} />
        ) : (
          <div className="divide-y divide-border">
            {lista.map((v) => (
              <div key={v.valor} className="flex items-center gap-4 px-5 py-2.5 hover:bg-surface-2 transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-fg truncate" title={v.valor}>{v.valor}</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-brand/60 rounded-full" style={{ width: `${Math.max(2, (v.qtd / max) * 100)}%` }} />
                  </div>
                </div>
                <span className="shrink-0 w-20 text-right text-sm font-medium text-fg tnum">{fmtInt(v.qtd)}</span>
                <span className="shrink-0 text-xs text-fg-subtle">vendas</span>
                <Button variante="secondary" onClick={() => abrirCriar(v)}>Criar regra</Button>
              </div>
            ))}
            {!busca.trim() && cauda > 0 && (
              <p className="px-5 py-3 text-xs text-fg-subtle">
                {fmtInt(cauda)} {cauda === 1 ? 'valor aparece' : 'valores aparecem'} em só 1 venda (cauda longa — geralmente ruído de visitor-id). Foque no topo.
              </p>
            )}
          </div>
        )}
      </Card>

      {modal && (
        <RegraModal
          modo="criar"
          inicial={modal.inicial}
          grupos={grupos}
          sellers={vendedores}
          intro={<p className="text-xs text-fg-muted">Criando regra para <span className="font-mono text-fg">{dim} = {modal.valor}</span> · ≈ {fmtInt(modal.qtd)} vendas a classificar têm esse valor exato. A regra classifica todas que casarem (e as futuras). Mude o tipo de match para ampliar (ex.: <em>contém</em> ou <em>começa com</em>).</p>}
          onGrupoCriado={(g) => setGrupos((prev) => [...prev, g].sort((a, b) => a.nome.localeCompare(b.nome)))}
          onFechar={() => setModal(null)}
          onSalvou={() => { setModal(null); carregar() }}
        />
      )}
    </div>
  )
}
