import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card, PageHeader, ErroBanner, Vazio, Button, Alert } from '../components/ui'
import RegraModal from '../components/RegraModal'
import { REGRA_VAZIA, regraParaForm, type NovaRegra, type MatchType, type RegraDB } from '../lib/regra'

// Regras de propagação — organizadas em ABAS por grupo de origem. A aba de um grupo
// que tem vendedores (Comercial) sub-agrupa por vendedor; as demais (Tráfego Pago,
// Orgânico, ...) listam as condições direto, sem vendedor. Mesma tabela
// origin_tracking_rules — só muda a visão. O modal é compartilhado (RegraModal).

interface Grupo { id: string; nome: string }
interface SellerLite { id: string; name: string }

const MATCH_LABELS: Record<MatchType, string> = { exact: '=', contains: 'contém', starts_with: 'começa com', is_empty: 'é vazio' }
const SEM_GRUPO = '__sem_grupo__'

const condsDaRegra = (r: RegraDB) => [
  (r.src_value || r.src_match === 'is_empty') && `src ${MATCH_LABELS[r.src_match]} ${r.src_match === 'is_empty' ? '' : r.src_value}`.trim(),
  (r.sck_value || r.sck_match === 'is_empty') && `sck ${MATCH_LABELS[r.sck_match]} ${r.sck_match === 'is_empty' ? '' : r.sck_value}`.trim(),
  (r.xcode_value || r.xcode_match === 'is_empty') && `xcode ${MATCH_LABELS[r.xcode_match]} ${r.xcode_match === 'is_empty' ? '' : r.xcode_value}`.trim(),
  (r.afiliado_value || r.afiliado_match === 'is_empty') && `afiliado ${MATCH_LABELS[r.afiliado_match]} ${r.afiliado_match === 'is_empty' ? '' : r.afiliado_value}`.trim(),
].filter(Boolean) as string[]

type ModalState = { modo: 'criar'; inicial: NovaRegra } | { modo: 'editar'; id: string; inicial: NovaRegra }

export default function Regras() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [sellers, setSellers] = useState<SellerLite[]>([])
  const [regras, setRegras] = useState<RegraDB[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<number | null>(null)
  const [abaAtiva, setAbaAtiva] = useState<string>('')
  const [expandido, setExpandido] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    const [r1, r2, r3] = await Promise.all([
      supabase.from('origin_groups').select('id,nome').order('nome'),
      supabase.from('sellers').select('id,name').eq('active', true).order('name'),
      supabase.from('origin_tracking_rules').select('*').order('created_at'),
    ])
    if (r1.error) setErro('Erro ao carregar grupos: ' + r1.error.message); else setGrupos((r1.data as Grupo[]) ?? [])
    if (!r2.error) setSellers((r2.data as SellerLite[]) ?? [])
    if (r3.error) setErro('Erro ao carregar regras: ' + r3.error.message); else setRegras((r3.data as RegraDB[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Abas = grupos + "Sem grupo" (só se houver regra com group_id null)
  const abas = useMemo(() => {
    const lista: { id: string; nome: string }[] = grupos.map((g) => ({ id: g.id, nome: g.nome }))
    if (regras.some((r) => !r.group_id)) lista.push({ id: SEM_GRUPO, nome: 'Sem grupo' })
    return lista
  }, [grupos, regras])

  // Aba efetiva: a selecionada se ainda existir, senão a primeira (derivado, sem effect)
  const abaEfetiva = abas.some((a) => a.id === abaAtiva) ? abaAtiva : (abas[0]?.id ?? '')

  const regrasDaAba = useMemo(
    () => regras.filter((r) => (r.group_id ?? SEM_GRUPO) === abaEfetiva),
    [regras, abaEfetiva],
  )
  const abaPorVendedor = regrasDaAba.some((r) => r.seller_id)
  const regrasSemVendedor = regrasDaAba.filter((r) => !r.seller_id)

  const toggle = (id: string) => setExpandido((prev) => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const novaCondicao = (grupoId: string, sellerId: string) =>
    setModal({ modo: 'criar', inicial: { ...REGRA_VAZIA, group_id: grupoId === SEM_GRUPO ? '' : grupoId, seller_id: sellerId } })

  const editarRegra = (r: RegraDB) => setModal({ modo: 'editar', id: r.id, inicial: regraParaForm(r) })

  const excluirRegra = async (id: string) => {
    if (!window.confirm('Excluir esta regra? As vendas que só ela classificava voltam para "a classificar".')) return
    const { error } = await supabase.from('origin_tracking_rules').delete().eq('id', id)
    if (error) { setErro('Erro ao excluir regra: ' + error.message); return }
    // reapply_all devolve pro "a classificar" as vendas que só essa regra classificava
    // (ou as re-atribui a outra regra que case). Sem isso ficariam órfãs no grupo errado.
    await supabase.rpc('apply_origin_rules')
    carregar()
  }

  const aplicarRegras = useCallback(async () => {
    setAplicando(true); setResultado(null)
    const { data, error } = await supabase.rpc('apply_origin_rules')
    if (error) setErro('Erro ao aplicar regras: ' + error.message)
    else setResultado(Number(data) || 0)
    setAplicando(false)
    carregar()
  }, [carregar])

  // Uma linha de regra (chips + editar/excluir) — função de render, não componente
  const renderLinha = (r: RegraDB) => (
    <div key={r.id} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
        {condsDaRegra(r).map((cond) => (
          <span key={cond} className="font-mono bg-surface-2 border border-border rounded px-1.5 py-0.5 text-[10px] text-fg-muted">{cond}</span>
        ))}
      </div>
      <div className="flex gap-3 shrink-0">
        <button onClick={() => editarRegra(r)} className="text-brand hover:text-brand/70 text-xs transition">Editar</button>
        <button onClick={() => excluirRegra(r.id)} className="text-expense hover:text-expense/70 text-xs transition">Excluir</button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Regras de propagação"
        subtitulo="Condições (src / sck / xcode / afiliado) que classificam as vendas automaticamente. Comercial é por vendedor; os demais grupos são por origem."
      />

      <ErroBanner mensagem={erro} />
      {resultado !== null && (
        <Alert tom="success">{resultado > 0 ? `${resultado} venda(s) classificada(s) no total pelas regras.` : 'Nenhuma venda classificada — crie regras que casem as vendas.'}</Alert>
      )}

      <div className="flex justify-end">
        <Button variante="secondary" onClick={aplicarRegras} loading={aplicando} disabled={regras.length === 0}>Aplicar agora</Button>
      </div>

      {carregando ? (
        <Vazio mensagem="Carregando…" />
      ) : (
        <>
          {/* Abas por grupo */}
          <div className="flex items-center gap-2 flex-wrap border-b border-border">
            {abas.map((a) => {
              const n = regras.filter((r) => (r.group_id ?? SEM_GRUPO) === a.id).length
              return (
                <button
                  key={a.id}
                  onClick={() => setAbaAtiva(a.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${abaEfetiva === a.id ? 'border-brand text-brand' : 'border-transparent text-fg-muted hover:text-fg'}`}
                >
                  {a.nome} <span className="text-xs text-fg-subtle tnum">{n}</span>
                </button>
              )
            })}
            <button
              onClick={() => novaCondicao(abaEfetiva === SEM_GRUPO ? '' : abaEfetiva, '')}
              className="ml-auto flex items-center gap-1 text-brand hover:text-brand/70 text-xs font-medium px-2 transition"
            >
              <Plus size={14} /> Nova condição
            </button>
          </div>

          {/* Conteúdo da aba */}
          {abaPorVendedor ? (
            // Aba com vendedores (Comercial): card por vendedor (todos os ativos) + bucket sem vendedor
            <div className="space-y-3">
              {sellers.map((s) => {
                const rs = regrasDaAba.filter((r) => r.seller_id === s.id)
                const aberto = expandido.has(s.id)
                return (
                  <Card key={s.id} className="overflow-hidden">
                    <button onClick={() => toggle(s.id)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2 transition text-left">
                      {aberto ? <ChevronDown size={18} className="text-fg-subtle shrink-0" /> : <ChevronRight size={18} className="text-fg-subtle shrink-0" />}
                      <span className="font-medium text-fg">{s.name}</span>
                      <span className="text-xs text-fg-subtle tnum">{rs.length === 0 ? 'sem regras' : `${rs.length} ${rs.length === 1 ? 'condição' : 'condições'}`}</span>
                    </button>
                    {aberto && (
                      <div className="border-t border-border px-5 py-3 space-y-1.5">
                        {rs.map(renderLinha)}
                        <button onClick={() => novaCondicao(abaEfetiva, s.id)} className="flex items-center gap-1.5 text-brand hover:text-brand/70 text-xs font-medium pt-2 transition">
                          <Plus size={14} /> adicionar condição
                        </button>
                      </div>
                    )}
                  </Card>
                )
              })}
              {regrasSemVendedor.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="px-5 py-3 border-b border-border"><span className="text-sm font-medium text-fg-muted">Sem vendedor</span></div>
                  <div className="px-5 py-3 space-y-1.5">
                    {regrasSemVendedor.map(renderLinha)}
                  </div>
                </Card>
              )}
            </div>
          ) : (
            // Aba sem vendedores (Tráfego/Orgânico/...): lista de condições direta
            <Card>
              <div className="px-5 py-3 space-y-1.5">
                {regrasDaAba.length === 0 ? (
                  <p className="text-sm text-fg-subtle py-4 text-center">Nenhuma condição neste grupo ainda.</p>
                ) : (
                  regrasDaAba.map(renderLinha)
                )}
                <button onClick={() => novaCondicao(abaEfetiva, '')} className="flex items-center gap-1.5 text-brand hover:text-brand/70 text-xs font-medium pt-2 transition">
                  <Plus size={14} /> adicionar condição
                </button>
              </div>
            </Card>
          )}
        </>
      )}

      {modal && (
        <RegraModal
          modo={modal.modo}
          regraId={modal.modo === 'editar' ? modal.id : undefined}
          inicial={modal.inicial}
          grupos={grupos}
          sellers={sellers}
          onGrupoCriado={(g) => setGrupos((prev) => [...prev, g].sort((a, b) => a.nome.localeCompare(b.nome)))}
          onFechar={() => setModal(null)}
          onSalvou={() => { setModal(null); carregar() }}
        />
      )}
    </div>
  )
}
