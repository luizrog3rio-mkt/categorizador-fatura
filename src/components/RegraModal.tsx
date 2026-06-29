import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { Modal, Button, Alert, inputCls } from './ui'
import { type MatchType, type NovaRegra, type VendaRef } from '../lib/regra'

// Modal compartilhado de criar/editar regra de propagação de origem. Usado em
// /regras e em /hotmart (classificar uma venda direto da tabela). Encapsula o
// salvar (insert/update + aplicar) e o modal aninhado de criar grupo.

interface GrupoLite { id: string; nome: string }
interface SellerLite { id: string; name: string }

const NOVO = '__novo__'

interface Props {
  modo: 'criar' | 'editar'
  regraId?: string
  inicial: NovaRegra
  grupos: GrupoLite[]
  sellers: SellerLite[]
  onGrupoCriado: (g: GrupoLite) => void
  onFechar: () => void
  onSalvou: () => void
  vendaRef?: VendaRef
  intro?: ReactNode
}

export default function RegraModal({ modo, regraId, inicial, grupos, sellers, onGrupoCriado, onFechar, onSalvou, vendaRef, intro }: Props) {
  const [novaRegra, setNovaRegra] = useState<NovaRegra>(inicial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [modalCriar, setModalCriar] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [alcance, setAlcance] = useState<number | null>(null) // quantas vendas a regra casa
  const [calculando, setCalculando] = useState(false)

  const regraValida = (r: NovaRegra) =>
    r.src_match === 'is_empty' || r.src_value.trim() ||
    r.sck_match === 'is_empty' || r.sck_value.trim() ||
    r.xcode_match === 'is_empty' || r.xcode_value.trim() ||
    r.afiliado_match === 'is_empty' || r.afiliado_value.trim()

  // Preview de alcance: conta as vendas que a regra casa (mesma lógica do motor:
  // exact=eq, contains/starts_with=ilike, is_empty=null/''). Debounced. Mata o
  // foot-gun de uma regra "é vazio" que despeja milhares sem o Luiz perceber.
  useEffect(() => {
    const campos: [string, MatchType, string][] = [
      ['src', novaRegra.src_match, novaRegra.src_value.trim()],
      ['sck', novaRegra.sck_match, novaRegra.sck_value.trim()],
      ['xcod', novaRegra.xcode_match, novaRegra.xcode_value.trim()],
      ['affiliate', novaRegra.afiliado_match, novaRegra.afiliado_value.trim()],
    ]
    const ativos = campos.filter(([, m, v]) => m === 'is_empty' || v)
    if (ativos.length === 0) { setAlcance(null); setCalculando(false); return }
    setCalculando(true)
    const t = setTimeout(async () => {
      let q = supabase.from('hotmart_sales').select('*', { count: 'exact', head: true })
      for (const [col, m, v] of ativos) {
        if (m === 'is_empty') q = q.or(`${col}.is.null,${col}.eq.`)
        else if (m === 'contains') q = q.ilike(col, `%${v}%`)
        else if (m === 'starts_with') q = q.ilike(col, `${v}%`)
        else q = q.eq(col, v)
      }
      const { count } = await q
      setAlcance(count ?? 0)
      setCalculando(false)
    }, 400)
    return () => clearTimeout(t)
  }, [novaRegra])

  const salvar = async () => {
    if (!regraValida(novaRegra)) return
    setSalvando(true)
    const payload = { src_value: novaRegra.src_value.trim() || null, src_match: novaRegra.src_match, sck_value: novaRegra.sck_value.trim() || null, sck_match: novaRegra.sck_match, xcode_value: novaRegra.xcode_value.trim() || null, xcode_match: novaRegra.xcode_match, afiliado_value: novaRegra.afiliado_value.trim() || null, afiliado_match: novaRegra.afiliado_match, group_id: novaRegra.group_id || null, seller_id: novaRegra.seller_id || null }
    const dupMsg = 'Essa regra já existe (mesmas condições e destino).'
    if (modo === 'criar') {
      const { error } = await supabase.from('origin_tracking_rules').insert(payload)
      if (error) { setErro(error.code === '23505' ? dupMsg : 'Erro ao salvar regra: ' + error.message); setSalvando(false); return }
      await supabase.rpc('apply_origin_rules')
    } else {
      const { error } = await supabase.from('origin_tracking_rules').update(payload).eq('id', regraId!)
      if (error) { setErro(error.code === '23505' ? dupMsg : 'Erro ao editar regra: ' + error.message); setSalvando(false); return }
      await supabase.rpc('force_apply_origin_rule', { p_rule_id: regraId! })
    }
    setSalvando(false)
    onSalvou()
  }

  const confirmarCriacaoGrupo = async () => {
    if (!nomeNovo.trim()) return
    setSalvando(true)
    const { data, error } = await supabase.from('origin_groups').insert({ nome: nomeNovo.trim() }).select('id,nome').single()
    if (error) { setErro('Erro ao criar grupo: ' + error.message); setSalvando(false); return }
    const g = data as GrupoLite
    onGrupoCriado(g)
    setNovaRegra((p) => ({ ...p, group_id: g.id }))
    setSalvando(false); setModalCriar(false); setNomeNovo('')
  }

  const usarValor = (valKey: keyof NovaRegra, matchKey: keyof NovaRegra, valor: string) =>
    setNovaRegra((p) => ({ ...p, [valKey]: valor, [matchKey]: 'exact' }))

  const todosChips: { label: string; valKey: keyof NovaRegra; matchKey: keyof NovaRegra; valor: string }[] = [
    { label: 'src', valKey: 'src_value', matchKey: 'src_match', valor: vendaRef?.src ?? '' },
    { label: 'sck', valKey: 'sck_value', matchKey: 'sck_match', valor: vendaRef?.sck ?? '' },
    { label: 'xcode', valKey: 'xcode_value', matchKey: 'xcode_match', valor: vendaRef?.xcod ?? '' },
    { label: 'afiliado', valKey: 'afiliado_value', matchKey: 'afiliado_match', valor: vendaRef?.affiliate ?? '' },
  ]
  const chips = todosChips.filter((c) => c.valor)

  return (
    <>
      <Modal
        titulo={modo === 'criar' ? 'Nova condição' : 'Editar condição'}
        aberto={true}
        onFechar={onFechar}
        largura="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variante="secondary" onClick={onFechar}>Cancelar</Button>
            <Button variante="primary" loading={salvando} disabled={!regraValida(novaRegra)} onClick={salvar}>Salvar e aplicar</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {intro}
          {chips.length > 0 && (
            <div className="rounded-control border border-border bg-surface-2 p-3">
              <p className="text-xs text-fg-muted mb-2">Valores desta venda — clique para usar como condição:</p>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => usarValor(c.valKey, c.matchKey, c.valor)}
                    className="font-mono text-[10px] bg-surface border border-border rounded px-2 py-1 text-fg-muted hover:border-brand hover:text-brand transition max-w-full truncate"
                    title={`${c.label}: ${c.valor}`}
                  >
                    {c.label}: {c.valor}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-fg-muted mb-2">A regra casa com TODAS as vendas onde os campos preenchidos coincidem (quanto menos campos, mais ampla). Deixe vazio o que não quiser usar.</p>
            <div className="space-y-2">
              {([['SRC', 'src_value', 'src_match', 'ex: FB'], ['SCK', 'sck_value', 'sck_match', 'ex: raphaella_silva'], ['XCODE', 'xcode_value', 'xcode_match', 'ex: AF2024'], ['Afiliado', 'afiliado_value', 'afiliado_match', 'ex: Raphaela Silva']] as const).map(([label, valKey, matchKey, ph]) => (
                <div key={valKey} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs text-fg-muted font-mono">{label}</span>
                  <select
                    className="shrink-0 rounded-control border border-border bg-surface px-2 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-brand"
                    value={novaRegra[matchKey]}
                    onChange={(e) => { const m = e.target.value as MatchType; setNovaRegra((p) => ({ ...p, [matchKey]: m, ...(m === 'is_empty' ? { [valKey]: '' } : {}) })) }}
                  >
                    <option value="exact">= exato</option>
                    <option value="contains">contém</option>
                    <option value="starts_with">começa com</option>
                    <option value="is_empty">é vazio</option>
                  </select>
                  {novaRegra[matchKey] !== 'is_empty' && (
                    <input
                      className={inputCls + ' flex-1'}
                      placeholder={ph}
                      value={novaRegra[valKey]}
                      onChange={(e) => setNovaRegra((p) => ({ ...p, [valKey]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
            {regraValida(novaRegra) && (
              <p className={`text-xs mt-2 ${alcance != null && alcance > 500 ? 'text-warning font-medium' : 'text-fg-subtle'}`}>
                {calculando ? 'Calculando alcance…' : alcance != null ? `Esta regra casa ${new Intl.NumberFormat('pt-BR').format(alcance)} venda(s)${alcance > 500 ? ' — confira antes de salvar.' : '.'}` : ''}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-fg-muted mb-1">Grupo</label>
            <select
              className={inputCls}
              value={novaRegra.group_id}
              onChange={(e) => e.target.value === NOVO ? (setNomeNovo(''), setModalCriar(true)) : setNovaRegra((p) => ({ ...p, group_id: e.target.value }))}
            >
              <option value="">— sem grupo —</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
              <option value={NOVO}>+ Novo grupo...</option>
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
          {erro && <Alert tom="danger">{erro}</Alert>}
        </div>
      </Modal>

      {/* Modal criar grupo — renderizado DEPOIS pra ficar por cima (mesmo z-50) */}
      {modalCriar && (
        <Modal
          titulo="Novo grupo"
          aberto={true}
          onFechar={() => setModalCriar(false)}
          largura="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variante="secondary" onClick={() => setModalCriar(false)}>Cancelar</Button>
              <Button variante="primary" loading={salvando} disabled={!nomeNovo.trim()} onClick={confirmarCriacaoGrupo}>Criar</Button>
            </div>
          }
        >
          <input
            autoFocus
            className={inputCls}
            placeholder="Nome do grupo"
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmarCriacaoGrupo() }}
          />
        </Modal>
      )}
    </>
  )
}
