import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtBRL, fmtData } from '../lib/format'
import type { HotmartSale } from '../lib/types'
import { Card, PageHeader, ErroBanner, KPICard, Vazio, Modal, Button, inputCls } from '../components/ui'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'

// Origem das vendas — classificação POR VENDA (modelo origem v3). Cada venda recebe
// Grupo, Canal e Vendedor direto na tabela. Grupo e Canal são listas que o Luiz cria
// (inline, via "➕"); Canal pertence a um Grupo. Grava em hotmart_sale_class; a origem
// é derivada ao vivo pela view hotmart_sales_origin. Regras de propagação virão depois.

interface Grupo { id: string; nome: string }
interface Canal { id: string; nome: string; group_id: string }
interface SellerLite { id: string; name: string }
interface GrupoTotal { grupo: string; vendas: number; liquido: number }

const NOVO = '__novo__'
const selCls = 'w-full rounded-control border border-border bg-surface px-2 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-40'

export default function Origem() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [canais, setCanais] = useState<Canal[]>([])
  const [sellers, setSellers] = useState<SellerLite[]>([])
  const [vendas, setVendas] = useState<HotmartSale[]>([])
  const [totais, setTotais] = useState<GrupoTotal[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modalCriar, setModalCriar] = useState<{ tipo: 'grupo' | 'canal'; venda: HotmartSale } | null>(null)
  const [nomeNovo, setNomeNovo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregarKpis = useCallback(async () => {
    const { data } = await supabase.rpc('hotmart_by_group', { p_company: null, p_start: null, p_end: null })
    setTotais(((data as GrupoTotal[]) ?? []).map((g) => ({ grupo: g.grupo, vendas: Number(g.vendas), liquido: Number(g.liquido) })))
  }, [])

  const carregar = useCallback(async () => {
    setErro(null)
    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from('origin_groups').select('id,nome').order('nome'),
      supabase.from('origin_channels').select('id,nome,group_id').order('nome'),
      supabase.from('sellers').select('id,name').eq('active', true).order('name'),
      supabase.from('hotmart_sales_origin').select('*').order('sale_date', { ascending: false }).limit(300),
      supabase.rpc('hotmart_by_group', { p_company: null, p_start: null, p_end: null }),
    ])
    if (r1.error) setErro('Erro ao carregar grupos: ' + r1.error.message); else setGrupos((r1.data as Grupo[]) ?? [])
    if (r2.error) setErro('Erro ao carregar canais: ' + r2.error.message); else setCanais((r2.data as Canal[]) ?? [])
    if (!r3.error) setSellers((r3.data as SellerLite[]) ?? [])
    if (r4.error) setErro('Erro ao carregar vendas: ' + r4.error.message); else setVendas((r4.data as HotmartSale[]) ?? [])
    if (!r5.error) setTotais(((r5.data as GrupoTotal[]) ?? []).map((g) => ({ grupo: g.grupo, vendas: Number(g.vendas), liquido: Number(g.liquido) })))
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useRealtimeRefetch('hotmart_sales', carregar)

  // grava a classificação da venda (otimista + upsert), mantendo as 3 dimensões
  const classificar = useCallback(async (v: HotmartSale, patch: Partial<Pick<HotmartSale, 'group_id' | 'channel_id' | 'seller_id'>>) => {
    const novo = {
      transaction_code: v.transaction_code,
      group_id: v.group_id ?? null,
      channel_id: v.channel_id ?? null,
      seller_id: v.seller_id ?? null,
      ...patch,
    }
    setVendas((prev) => prev.map((x) => (x.id === v.id ? { ...x, group_id: novo.group_id, channel_id: novo.channel_id, seller_id: novo.seller_id } : x)))
    const { error } = await supabase.from('hotmart_sale_class').upsert({ ...novo, updated_at: new Date().toISOString() }, { onConflict: 'transaction_code' })
    if (error) setErro('Erro ao classificar: ' + error.message)
    carregarKpis()
  }, [carregarKpis])

  const criarGrupo = useCallback((v: HotmartSale) => {
    setNomeNovo('')
    setModalCriar({ tipo: 'grupo', venda: v })
  }, [])

  const criarCanal = useCallback((v: HotmartSale) => {
    if (!v.group_id) return
    setNomeNovo('')
    setModalCriar({ tipo: 'canal', venda: v })
  }, [])

  const confirmarCriacao = useCallback(async () => {
    if (!modalCriar || !nomeNovo.trim()) return
    setSalvando(true)
    const { tipo, venda } = modalCriar
    if (tipo === 'grupo') {
      const { data, error } = await supabase.from('origin_groups').insert({ nome: nomeNovo.trim() }).select('id,nome').single()
      if (error) { setErro('Erro ao criar grupo: ' + error.message); setSalvando(false); return }
      setGrupos((prev) => [...prev, data as Grupo].sort((a, b) => a.nome.localeCompare(b.nome)))
      classificar(venda, { group_id: (data as Grupo).id, channel_id: null })
    } else {
      const { data, error } = await supabase.from('origin_channels').insert({ nome: nomeNovo.trim(), group_id: venda.group_id }).select('id,nome,group_id').single()
      if (error) { setErro('Erro ao criar canal: ' + error.message); setSalvando(false); return }
      setCanais((prev) => [...prev, data as Canal].sort((a, b) => a.nome.localeCompare(b.nome)))
      classificar(venda, { channel_id: (data as Canal).id })
    }
    setSalvando(false)
    setModalCriar(null)
  }, [modalCriar, nomeNovo, classificar])

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Origem das vendas"
        subtitulo="Classifique cada venda em Grupo, Canal e Vendedor. Grupo e Canal você cria na hora pelo “➕” do próprio campo."
      />

      <ErroBanner mensagem={erro} />

      {/* KPIs por grupo (dinâmico — só aparecem os grupos com vendas + A classificar) */}
      {totais.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {totais.map((g) => (
            <KPICard
              key={g.grupo}
              label={g.grupo === 'a_classificar' ? 'A classificar' : g.grupo}
              valor={`${g.vendas} · ${fmtBRL(g.liquido)}`}
              tom={g.grupo === 'a_classificar' ? 'warning' : 'neutro'}
            />
          ))}
        </div>
      )}

      <Card>
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">Vendas</h2>
          <p className="text-xs text-fg-subtle mt-0.5">300 vendas mais recentes. Marque Grupo › Canal › Vendedor em cada linha.</p>
        </div>
        {carregando ? (
          <Vazio mensagem="Carregando…" />
        ) : vendas.length === 0 ? (
          <Vazio mensagem="Nenhuma venda. As vendas aparecem aqui conforme o sync/webhook preenche o histórico." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-fg-subtle uppercase tracking-wide">
                  <th className="text-left px-3 h-10 font-medium">Data</th>
                  <th className="text-left px-3 h-10 font-medium">Produto</th>
                  <th className="text-left px-3 h-10 font-medium">src</th>
                  <th className="text-left px-3 h-10 font-medium">sck</th>
                  <th className="text-left px-3 h-10 font-medium">xcode</th>
                  <th className="text-left px-3 h-10 font-medium">Afiliado</th>
                  <th className="text-left px-3 h-10 font-medium w-40">Grupo</th>
                  <th className="text-left px-3 h-10 font-medium w-40">Canal</th>
                  <th className="text-left px-3 h-10 font-medium w-40">Vendedor</th>
                  <th className="text-right px-3 h-10 font-medium">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0 hover:bg-surface-2 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-fg-muted tnum">{fmtData(v.sale_date)}</td>
                    <td className="px-3 py-2 text-fg max-w-[200px] truncate" title={v.product}>{v.product}</td>
                    <td className="px-3 py-2 text-xs text-fg-subtle break-all max-w-[160px]">{v.src || '—'}</td>
                    <td className="px-3 py-2 text-xs text-fg-subtle break-all max-w-[160px]">{v.sck || '—'}</td>
                    <td className="px-3 py-2 text-xs text-fg-subtle break-all max-w-[120px]">{v.xcod || '—'}</td>
                    <td className="px-3 py-2 text-fg-muted max-w-[140px] truncate" title={v.affiliate ?? ''}>{v.affiliate || '—'}</td>
                    <td className="px-3 py-2">
                      <select className={selCls} value={v.group_id ?? ''} onChange={(e) => (e.target.value === NOVO ? criarGrupo(v) : classificar(v, { group_id: e.target.value || null, channel_id: null }))}>
                        <option value="">—</option>
                        {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                        <option value={NOVO}>➕ Novo grupo…</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select className={selCls} value={v.channel_id ?? ''} disabled={!v.group_id} onChange={(e) => (e.target.value === NOVO ? criarCanal(v) : classificar(v, { channel_id: e.target.value || null }))}>
                        <option value="">{v.group_id ? '—' : 'escolha o grupo'}</option>
                        {canais.filter((c) => c.group_id === v.group_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        {v.group_id && <option value={NOVO}>➕ Novo canal…</option>}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select className={selCls} value={v.seller_id ?? ''} onChange={(e) => classificar(v, { seller_id: e.target.value || null })}>
                        <option value="">—</option>
                        {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-revenue tnum whitespace-nowrap">{fmtBRL(Number(v.net_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalCriar && (
        <Modal
          titulo={modalCriar.tipo === 'grupo' ? 'Novo grupo' : 'Novo canal'}
          aberto={true}
          onFechar={() => setModalCriar(null)}
          largura="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variante="secondary" onClick={() => setModalCriar(null)}>Cancelar</Button>
              <Button variante="primary" loading={salvando} disabled={!nomeNovo.trim()} onClick={confirmarCriacao}>Criar</Button>
            </div>
          }
        >
          <input
            autoFocus
            className={inputCls}
            placeholder={modalCriar.tipo === 'grupo' ? 'Nome do grupo' : 'Nome do canal'}
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmarCriacao() }}
          />
        </Modal>
      )}
    </div>
  )
}
