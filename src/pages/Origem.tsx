import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtBRL, fmtData } from '../lib/format'
import type { HotmartSale } from '../lib/types'
import { Card, PageHeader, ErroBanner, KPICard, Vazio, Modal, Button, inputCls } from '../components/ui'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'

// Origem das vendas — classificação POR VENDA (modelo origem v3) + regras persistentes de propagação.

interface Grupo { id: string; nome: string }
interface Canal { id: string; nome: string; group_id: string }
interface SellerLite { id: string; name: string }
interface GrupoTotal { grupo: string; vendas: number; liquido: number }
interface Regra { id: string; field: 'src' | 'sck' | 'xcode'; value: string; group_id: string | null; channel_id: string | null; seller_id: string | null }
type Filtro = 'a_classificar' | 'classificadas' | 'todas'

const NOVO = '__novo__'
const selCls = 'w-full rounded-control border border-border bg-surface px-2 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-40'
const CAMPOS = [{ value: 'src', label: 'src' }, { value: 'sck', label: 'sck' }, { value: 'xcode', label: 'xcode' }] as const

export default function Origem() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [canais, setCanais] = useState<Canal[]>([])
  const [sellers, setSellers] = useState<SellerLite[]>([])
  const [vendas, setVendas] = useState<HotmartSale[]>([])
  const [totais, setTotais] = useState<GrupoTotal[]>([])
  const [regras, setRegras] = useState<Regra[]>([])
  const [filtro, setFiltro] = useState<Filtro>('a_classificar')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // modal criar grupo/canal
  const [modalCriar, setModalCriar] = useState<{ tipo: 'grupo' | 'canal'; venda: HotmartSale } | null>(null)
  const [nomeNovo, setNomeNovo] = useState('')
  const [salvando, setSalvando] = useState(false)

  // modal criar/editar regra
  const [modalRegra, setModalRegra] = useState<{ modo: 'criar' } | { modo: 'editar'; id: string } | null>(null)
  const [novaRegra, setNovaRegra] = useState<{ field: 'src' | 'sck' | 'xcode'; value: string; group_id: string; channel_id: string; seller_id: string }>({ field: 'src', value: '', group_id: '', channel_id: '', seller_id: '' })
  const [aplicando, setAplicando] = useState(false)

  const carregarKpis = useCallback(async () => {
    const { data } = await supabase.rpc('hotmart_by_group', { p_company: null, p_start: null, p_end: null })
    setTotais(((data as GrupoTotal[]) ?? []).map((g) => ({ grupo: g.grupo, vendas: Number(g.vendas), liquido: Number(g.liquido) })))
  }, [])

  const carregar = useCallback(async () => {
    setErro(null)
    let vendasQ = supabase.from('hotmart_sales_origin').select('*').order('sale_date', { ascending: false }).limit(300)
    if (filtro === 'a_classificar') vendasQ = vendasQ.eq('origem', 'a_classificar')
    else if (filtro === 'classificadas') vendasQ = vendasQ.neq('origem', 'a_classificar')
    const [r1, r2, r3, r4, r5, r6] = await Promise.all([
      supabase.from('origin_groups').select('id,nome').order('nome'),
      supabase.from('origin_channels').select('id,nome,group_id').order('nome'),
      supabase.from('sellers').select('id,name').eq('active', true).order('name'),
      vendasQ,
      supabase.rpc('hotmart_by_group', { p_company: null, p_start: null, p_end: null }),
      supabase.from('origin_tracking_rules').select('*').order('field').order('value'),
    ])
    if (r1.error) setErro('Erro ao carregar grupos: ' + r1.error.message); else setGrupos((r1.data as Grupo[]) ?? [])
    if (r2.error) setErro('Erro ao carregar canais: ' + r2.error.message); else setCanais((r2.data as Canal[]) ?? [])
    if (!r3.error) setSellers((r3.data as SellerLite[]) ?? [])
    if (r4.error) setErro('Erro ao carregar vendas: ' + r4.error.message); else setVendas((r4.data as HotmartSale[]) ?? [])
    if (!r5.error) setTotais(((r5.data as GrupoTotal[]) ?? []).map((g) => ({ grupo: g.grupo, vendas: Number(g.vendas), liquido: Number(g.liquido) })))
    if (!r6.error) setRegras((r6.data as Regra[]) ?? [])
    setCarregando(false)
  }, [filtro])

  useEffect(() => { carregar() }, [carregar])
  useRealtimeRefetch('hotmart_sales', carregar)

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
    setNomeNovo(''); setModalCriar({ tipo: 'grupo', venda: v })
  }, [])

  const criarCanal = useCallback((v: HotmartSale) => {
    if (!v.group_id) return
    setNomeNovo(''); setModalCriar({ tipo: 'canal', venda: v })
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
    setSalvando(false); setModalCriar(null)
  }, [modalCriar, nomeNovo, classificar])

  const abrirModalRegra = useCallback(() => {
    setNovaRegra({ field: 'src', value: '', group_id: '', channel_id: '', seller_id: '' })
    setModalRegra({ modo: 'criar' })
  }, [])

  const editarRegra = useCallback((r: Regra) => {
    setNovaRegra({ field: r.field, value: r.value, group_id: r.group_id ?? '', channel_id: r.channel_id ?? '', seller_id: r.seller_id ?? '' })
    setModalRegra({ modo: 'editar', id: r.id })
  }, [])

  const salvarRegra = useCallback(async () => {
    if (!novaRegra.value.trim() || !modalRegra) return
    setSalvando(true)
    const payload = { field: novaRegra.field, value: novaRegra.value.trim(), group_id: novaRegra.group_id || null, channel_id: novaRegra.channel_id || null, seller_id: novaRegra.seller_id || null }
    if (modalRegra.modo === 'criar') {
      const { data, error } = await supabase.from('origin_tracking_rules').insert(payload).select('*').single()
      if (error) { setErro('Erro ao salvar regra: ' + error.message); setSalvando(false); return }
      setRegras((prev) => [...prev, data as Regra])
    } else {
      const { data, error } = await supabase.from('origin_tracking_rules').update(payload).eq('id', modalRegra.id).select('*').single()
      if (error) { setErro('Erro ao editar regra: ' + error.message); setSalvando(false); return }
      setRegras((prev) => prev.map((r) => r.id === modalRegra.id ? data as Regra : r))
    }
    setModalRegra(null); setSalvando(false)
    await supabase.rpc('apply_origin_rules')
    carregar()
  }, [novaRegra, modalRegra, carregar])

  const excluirRegra = useCallback(async (id: string) => {
    const { error } = await supabase.from('origin_tracking_rules').delete().eq('id', id)
    if (error) { setErro('Erro ao excluir regra: ' + error.message); return }
    setRegras((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const aplicarRegras = useCallback(async () => {
    setAplicando(true)
    const { data, error } = await supabase.rpc('apply_origin_rules')
    if (error) setErro('Erro ao aplicar regras: ' + error.message)
    else if (Number(data) > 0) setErro(null)
    setAplicando(false)
    carregar()
  }, [carregar])

  const nomeGrupo = (id: string | null) => grupos.find((g) => g.id === id)?.nome ?? '—'
  const nomeCanal = (id: string | null) => canais.find((c) => c.id === id)?.nome ?? '—'
  const nomeSeller = (id: string | null) => sellers.find((s) => s.id === id)?.name ?? '—'

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Origem das vendas"
        subtitulo={'Classifique cada venda em Grupo, Canal e Vendedor. Grupo e Canal você cria na hora pelo "+" do próprio campo.'}
      />

      <ErroBanner mensagem={erro} />

      {/* KPIs por grupo */}
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

      {/* Card de regras de propagação */}
      <Card>
        <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-fg">Regras de propagação</h2>
            <p className="text-xs text-fg-subtle mt-0.5">Defina regras por src / sck / xcode para classificar vendas automaticamente.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variante="secondary" onClick={aplicarRegras} loading={aplicando} disabled={regras.length === 0}>Aplicar agora</Button>
            <Button variante="primary" onClick={abrirModalRegra}>+ Adicionar</Button>
          </div>
        </div>
        {regras.length === 0 ? (
          <Vazio mensagem="Nenhuma regra cadastrada. Adicione uma regra para propagar classificações automaticamente." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border text-xs text-fg-subtle uppercase tracking-wide">
                  <th className="text-left px-4 h-9 font-medium">Campo</th>
                  <th className="text-left px-4 h-9 font-medium">Valor</th>
                  <th className="text-left px-4 h-9 font-medium">Grupo</th>
                  <th className="text-left px-4 h-9 font-medium">Canal</th>
                  <th className="text-left px-4 h-9 font-medium">Vendedor</th>
                  <th className="px-4 h-9" />
                </tr>
              </thead>
              <tbody>
                {regras.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-2 font-mono text-fg-muted">{r.field}</td>
                    <td className="px-4 py-2 text-fg">{r.value}</td>
                    <td className="px-4 py-2 text-fg-muted">{nomeGrupo(r.group_id)}</td>
                    <td className="px-4 py-2 text-fg-muted">{nomeCanal(r.channel_id)}</td>
                    <td className="px-4 py-2 text-fg-muted">{nomeSeller(r.seller_id)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => editarRegra(r)} className="text-brand hover:text-brand/70 text-xs transition">Editar</button>
                        <button onClick={() => excluirRegra(r.id)} className="text-expense hover:text-expense/70 text-xs transition">Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Card de vendas */}
      <Card>
        <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-fg">Vendas</h2>
            <p className="text-xs text-fg-subtle mt-0.5">
              {filtro === 'a_classificar' && 'Até 300 sem classificação. Marque Grupo › Canal › Vendedor em cada linha.'}
              {filtro === 'classificadas' && 'Até 300 já classificadas.'}
              {filtro === 'todas' && 'Até 300 mais recentes.'}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            {(['a_classificar', 'classificadas', 'todas'] as Filtro[]).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1 rounded-control text-xs font-medium transition ${filtro === f ? 'bg-brand text-white' : 'bg-surface-2 text-fg-muted hover:bg-border'}`}
              >
                {f === 'a_classificar' ? 'A classificar' : f === 'classificadas' ? 'Classificadas' : 'Todas'}
              </button>
            ))}
          </div>
        </div>
        {carregando ? (
          <Vazio mensagem="Carregando…" />
        ) : vendas.length === 0 ? (
          <Vazio mensagem="Nenhuma venda encontrada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
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
                    <td className="px-3 py-2 text-fg-subtle break-all max-w-[160px]">{v.src || '—'}</td>
                    <td className="px-3 py-2 text-fg-subtle break-all max-w-[160px]">{v.sck || '—'}</td>
                    <td className="px-3 py-2 text-fg-subtle break-all max-w-[120px]">{v.xcod || '—'}</td>
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

      {/* Modal criar grupo/canal */}
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

      {/* Modal criar/editar regra */}
      {modalRegra && (
        <Modal
          titulo={modalRegra.modo === 'criar' ? 'Nova regra de propagação' : 'Editar regra'}
          aberto={true}
          onFechar={() => setModalRegra(null)}
          largura="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variante="secondary" onClick={() => setModalRegra(null)}>Cancelar</Button>
              <Button variante="primary" loading={salvando} disabled={!novaRegra.value.trim()} onClick={salvarRegra}>Salvar e aplicar</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-32 shrink-0">
                <label className="block text-xs text-fg-muted mb-1">Campo</label>
                <select
                  className={inputCls}
                  value={novaRegra.field}
                  disabled={modalRegra?.modo === 'editar'}
                  onChange={(e) => setNovaRegra((p) => ({ ...p, field: e.target.value as 'src' | 'sck' | 'xcode' }))}
                >
                  {CAMPOS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-fg-muted mb-1">Valor exato</label>
                <input
                  autoFocus
                  className={inputCls}
                  placeholder="ex: comercial_luiz-otavio"
                  value={novaRegra.value}
                  disabled={modalRegra?.modo === 'editar'}
                  onChange={(e) => setNovaRegra((p) => ({ ...p, value: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') salvarRegra() }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-1">Grupo</label>
              <select
                className={inputCls}
                value={novaRegra.group_id}
                onChange={(e) => setNovaRegra((p) => ({ ...p, group_id: e.target.value, channel_id: '' }))}
              >
                <option value="">— sem grupo —</option>
                {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-1">Canal</label>
              <select
                className={inputCls}
                value={novaRegra.channel_id}
                disabled={!novaRegra.group_id}
                onChange={(e) => setNovaRegra((p) => ({ ...p, channel_id: e.target.value }))}
              >
                <option value="">{novaRegra.group_id ? '— sem canal —' : 'escolha o grupo primeiro'}</option>
                {canais.filter((c) => c.group_id === novaRegra.group_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-1">Vendedor</label>
              <select
                className={inputCls}
                value={novaRegra.seller_id}
                onChange={(e) => setNovaRegra((p) => ({ ...p, seller_id: e.target.value }))}
              >
                <option value="">— sem vendedor —</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
