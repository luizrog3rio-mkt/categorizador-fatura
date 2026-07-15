import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sparkles, Plus, Trash2, Wand2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import {
  PageHeader, Card, KPICard, KPIStrip, Vazio, Alert, ErroBanner, Button, Badge, Modal, inputCls,
} from '../components/ui'

// Tela "Classificar despesas" (Fase 5b do roadmap DRE/Balanço). Ataca o balde de
// lançamentos SEM conta que caem em NC-2 e distorcem a DRE. Consome a RPC read-only
// sugerir_contas: cada item vem com a conta SUGERIDA pela regra que casa. O humano
// CONFIRMA e aplica (a RPC nunca grava — "o sistema propõe, não decide"). O apply
// grava chart_of_account_id no lançamento (entries) ou na linha de cartão (transactions).

interface Sugestao {
  fonte: 'entry' | 'cartao'
  id: string
  descricao: string | null
  valor: number
  data: string | null
  company_id: string
  conta_id: string | null
  conta_code: string | null
  conta_name: string | null
  regra_id: string | null
}
interface Conta { id: string; code: string; name: string }
interface Regra {
  id: string
  padrao: string
  match_type: 'contains' | 'starts_with' | 'exact'
  chart_of_account_id: string
  aplica_em: 'entries' | 'cartao' | 'ambos'
  prioridade: number
  ativa: boolean
  conta?: { code: string; name: string } | null
}
type NovaRegra = {
  padrao: string
  match_type: Regra['match_type']
  chart_of_account_id: string
  aplica_em: Regra['aplica_em']
  prioridade: number
}

const fmtMoeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')
const MATCH_ROTULO: Record<Regra['match_type'], string> = { contains: 'contém', starts_with: 'começa com', exact: 'exato' }
const APLICA_ROTULO: Record<Regra['aplica_em'], string> = { entries: 'lançamentos', cartao: 'cartão', ambos: 'ambos' }

export default function ClassificarDespesas() {
  const { empresaAtiva, isAdmin } = useApp()
  const toast = useToast()
  const confirmar = useConfirm()

  const [itens, setItens] = useState<Sugestao[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [regras, setRegras] = useState<Regra[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'com' | 'sem'>('com')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [contaManual, setContaManual] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [modalRegra, setModalRegra] = useState<NovaRegra | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null); setSel(new Set())
    const [bal, cta, reg] = await Promise.all([
      supabase.rpc('sugerir_contas', { p_company: empresaAtiva?.id ?? null }),
      supabase.from('chart_of_accounts').select('id,code,name').eq('is_analytical', true).eq('active', true).eq('tipo', 'resultado').order('code'),
      supabase.from('regras_conta').select('*, conta:chart_of_accounts(code,name)').order('prioridade'),
    ])
    if (bal.error) setErro('Erro ao carregar o balde: ' + bal.error.message)
    else setItens(((bal.data as Sugestao[]) ?? []).map((s) => ({ ...s, valor: Number(s.valor) })))
    setContas((cta.data as Conta[]) ?? [])
    setRegras((reg.data as Regra[]) ?? [])
    setCarregando(false)
  }, [empresaAtiva])

  useEffect(() => { carregar() }, [carregar])

  const chave = (s: Sugestao) => `${s.fonte}:${s.id}`
  const lista = useMemo(() => {
    if (filtro === 'com') return itens.filter((s) => s.conta_id)
    if (filtro === 'sem') return itens.filter((s) => !s.conta_id)
    return itens
  }, [itens, filtro])

  const comSugestao = useMemo(() => itens.filter((s) => s.conta_id).length, [itens])
  const totalBalde = useMemo(() => itens.reduce((acc, s) => acc + s.valor, 0), [itens])

  const toggleSel = (s: Sugestao) => {
    const k = chave(s)
    setSel((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }
  const selecionarVisiveis = () => setSel(new Set(lista.map(chave)))
  const limparSel = () => setSel(new Set())

  // Aplica contas (grava chart_of_account_id). Agrupa por (fonte, conta) → 1 update por grupo.
  const aplicar = useCallback(async (alvos: { fonte: string; id: string; conta_id: string }[]) => {
    if (!alvos.length) return
    setSalvando(true); setErro(null)
    const grupos = new Map<string, { tabela: string; conta: string; ids: string[] }>()
    for (const a of alvos) {
      const tabela = a.fonte === 'cartao' ? 'transactions' : 'entries'
      const k = `${tabela}:${a.conta_id}`
      if (!grupos.has(k)) grupos.set(k, { tabela, conta: a.conta_id, ids: [] })
      grupos.get(k)!.ids.push(a.id)
    }
    let ok = 0
    for (const g of grupos.values()) {
      const { error } = await supabase.from(g.tabela).update({ chart_of_account_id: g.conta }).in('id', g.ids)
      if (error) { setErro('Erro ao aplicar: ' + error.message); setSalvando(false); return }
      ok += g.ids.length
    }
    setSalvando(false)
    toast(`${ok} ${ok === 1 ? 'lançamento classificado' : 'lançamentos classificados'}.`)
    carregar()
  }, [carregar, toast])

  const aplicarSugestoesSelecionadas = () => {
    const alvos = itens
      .filter((s) => sel.has(chave(s)) && s.conta_id)
      .map((s) => ({ fonte: s.fonte, id: s.id, conta_id: s.conta_id! }))
    aplicar(alvos)
  }
  const aplicarContaManual = () => {
    if (!contaManual) return
    const alvos = itens
      .filter((s) => sel.has(chave(s)))
      .map((s) => ({ fonte: s.fonte, id: s.id, conta_id: contaManual }))
    aplicar(alvos)
  }
  const aplicarUm = (s: Sugestao) => {
    if (!s.conta_id) return
    aplicar([{ fonte: s.fonte, id: s.id, conta_id: s.conta_id }])
  }

  const abrirCriarRegra = (s?: Sugestao) => {
    setModalRegra({
      padrao: s?.descricao ?? '',
      match_type: 'contains',
      chart_of_account_id: s?.conta_id ?? '',
      aplica_em: 'ambos',
      prioridade: 100,
    })
  }
  const salvarRegra = async () => {
    if (!modalRegra || !modalRegra.padrao.trim() || !modalRegra.chart_of_account_id) return
    setSalvando(true)
    const { error } = await supabase.from('regras_conta').insert({
      padrao: modalRegra.padrao.trim(),
      match_type: modalRegra.match_type,
      chart_of_account_id: modalRegra.chart_of_account_id,
      aplica_em: modalRegra.aplica_em,
      prioridade: modalRegra.prioridade,
    })
    setSalvando(false)
    if (error) { setErro('Erro ao salvar regra: ' + error.message); return }
    setModalRegra(null)
    toast('Regra criada.')
    carregar()
  }
  const toggleRegra = async (r: Regra) => {
    const { error } = await supabase.from('regras_conta').update({ ativa: !r.ativa }).eq('id', r.id)
    if (error) { setErro(error.message); return }
    carregar()
  }
  const excluirRegra = async (r: Regra) => {
    if (!(await confirmar({ mensagem: `Excluir a regra "${r.padrao}"?`, perigo: true, confirmar: 'Excluir' }))) return
    const { error } = await supabase.from('regras_conta').delete().eq('id', r.id)
    if (error) { setErro(error.message); return }
    toast('Regra excluída.')
    carregar()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Classificar despesas"
        subtitulo="O balde de lançamentos sem conta que distorce a DRE. As regras propõem a conta; você confirma e aplica."
        acao={isAdmin ? <Button onClick={() => abrirCriarRegra()}><Plus size={16} /> Nova regra</Button> : undefined}
      />
      <ErroBanner mensagem={erro} />

      <KPIStrip cols={3}>
        <KPICard bare label="No balde" valor={carregando ? '…' : itens.length} caption="lançamentos sem conta" />
        <KPICard bare label="Com sugestão" valor={carregando ? '…' : comSugestao} tom="brand" caption="uma regra casou" />
        <KPICard bare label="Valor no balde" valor={carregando ? '…' : fmtMoeda(totalBalde)} tom="expense" />
      </KPIStrip>

      {!carregando && !isAdmin && (
        <Alert tom="warning" titulo="Só leitura">Seu perfil não pode aplicar contas nem editar regras.</Alert>
      )}

      <Card>
        {/* barra de filtro + ações em massa */}
        <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-1">
            {([['com', 'Com sugestão'], ['sem', 'Sem sugestão'], ['todos', 'Todos']] as const).map(([k, r]) => (
              <button
                key={k}
                onClick={() => { setFiltro(k); limparSel() }}
                className={`px-3 py-1 rounded-control text-xs font-medium transition ${filtro === k ? 'bg-brand text-white' : 'bg-surface-2 text-fg-muted hover:bg-border'}`}
              >
                {r}
              </button>
            ))}
          </div>
          {isAdmin && sel.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-fg-subtle tnum">{sel.size} selecionado{sel.size > 1 ? 's' : ''}</span>
              <Button tamanho="sm" variante="primary" loading={salvando} onClick={aplicarSugestoesSelecionadas}>
                <Sparkles size={14} /> Aplicar sugestões
              </Button>
              <select className="rounded-control border border-border-strong bg-surface px-2 py-1 text-xs text-fg" value={contaManual} onChange={(e) => setContaManual(e.target.value)}>
                <option value="">conta manual…</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
              </select>
              <Button tamanho="sm" variante="secondary" loading={salvando} disabled={!contaManual} onClick={aplicarContaManual}>Aplicar conta</Button>
              <button onClick={limparSel} className="text-xs text-fg-subtle hover:text-fg-muted">limpar</button>
            </div>
          )}
        </div>

        {carregando ? (
          <Vazio mensagem="Carregando…" />
        ) : lista.length === 0 ? (
          <Vazio mensagem={filtro === 'sem' ? 'Nenhum item sem sugestão. 🎉' : filtro === 'com' ? 'Nenhuma sugestão pronta — crie regras para acelerar.' : 'Balde vazio. 🎉'} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-subtle border-b border-border">
                {isAdmin && (
                  <th className="w-8 px-3 py-2">
                    <input type="checkbox" checked={sel.size > 0 && sel.size === lista.length} onChange={(e) => e.target.checked ? selecionarVisiveis() : limparSel()} />
                  </th>
                )}
                <th className="px-2 py-2 font-medium">Descrição</th>
                <th className="px-2 py-2 font-medium">Data</th>
                <th className="px-2 py-2 font-medium text-right">Valor</th>
                <th className="px-2 py-2 font-medium">Conta sugerida</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lista.map((s) => {
                const k = chave(s)
                return (
                  <tr key={k} className="hover:bg-surface-2 transition">
                    {isAdmin && (
                      <td className="px-3 py-2"><input type="checkbox" checked={sel.has(k)} onChange={() => toggleSel(s)} /></td>
                    )}
                    <td className="px-2 py-2 max-w-md">
                      <div className="flex items-center gap-2">
                        <Badge tom={s.fonte === 'cartao' ? 'muted' : 'brand'}>{s.fonte === 'cartao' ? 'cartão' : 'lanç.'}</Badge>
                        <span className="truncate text-fg" title={s.descricao ?? ''}>{s.descricao ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-fg-muted tnum whitespace-nowrap">{fmtData(s.data)}</td>
                    <td className="px-2 py-2 text-right tnum whitespace-nowrap text-expense">{fmtMoeda(s.valor)}</td>
                    <td className="px-2 py-2">
                      {s.conta_id
                        ? <span className="inline-flex items-center gap-1.5 text-xs"><span className="font-mono text-fg-muted">{s.conta_code}</span><span className="text-fg-subtle truncate max-w-[180px]" title={s.conta_name ?? ''}>{s.conta_name}</span></span>
                        : <span className="text-fg-subtle text-xs">— sem regra</span>}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">
                      {isAdmin && (s.conta_id
                        ? <Button tamanho="sm" variante="ghost" loading={salvando} onClick={() => aplicarUm(s)}><Wand2 size={13} /> aplicar</Button>
                        : <Button tamanho="sm" variante="ghost" onClick={() => abrirCriarRegra(s)}><Plus size={13} /> regra</Button>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Regras existentes */}
      <Card>
        <div className="px-5 pt-4 pb-2 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-fg text-sm">Regras de sugestão <span className="text-fg-subtle font-normal">({regras.length})</span></h3>
          {isAdmin && <Button tamanho="sm" variante="secondary" onClick={() => abrirCriarRegra()}><Plus size={14} /> Nova</Button>}
        </div>
        {regras.length === 0 ? (
          <Vazio mensagem="Nenhuma regra ainda. Crie uma a partir de um item do balde ou pelo botão acima." />
        ) : (
          <div className="divide-y divide-border">
            {regras.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 px-5 py-2.5 ${r.ativa ? '' : 'opacity-50'}`}>
                <span className="font-mono text-xs text-fg truncate max-w-[220px]" title={r.padrao}>{r.padrao}</span>
                <span className="text-xs text-fg-subtle">{MATCH_ROTULO[r.match_type]}</span>
                <span className="text-fg-subtle">→</span>
                <span className="text-xs"><span className="font-mono text-fg-muted">{r.conta?.code}</span> <span className="text-fg-subtle">{r.conta?.name}</span></span>
                <Badge tom="muted">{APLICA_ROTULO[r.aplica_em]}</Badge>
                <span className="ml-auto flex items-center gap-2">
                  {isAdmin && (
                    <>
                      <button onClick={() => toggleRegra(r)} className="text-xs text-fg-subtle hover:text-fg-muted">{r.ativa ? 'desativar' : 'ativar'}</button>
                      <button onClick={() => excluirRegra(r)} className="text-fg-subtle hover:text-expense" aria-label="Excluir regra"><Trash2 size={14} /></button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal criar regra */}
      {modalRegra && (
        <Modal titulo="Nova regra de sugestão" aberto onFechar={() => setModalRegra(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variante="secondary" onClick={() => setModalRegra(null)}>Cancelar</Button>
              <Button loading={salvando} disabled={!modalRegra.padrao.trim() || !modalRegra.chart_of_account_id} onClick={salvarRegra}>Salvar regra</Button>
            </div>
          }>
          <div className="space-y-4">
            <Alert tom="info">A regra <strong>propõe</strong> a conta para os lançamentos que casarem o texto — você ainda confirma e aplica. Nunca classifica sozinha.</Alert>
            <div>
              <label className="block text-sm font-medium mb-1">Padrão (palavra-chave)</label>
              <input className={inputCls} value={modalRegra.padrao} onChange={(e) => setModalRegra({ ...modalRegra, padrao: e.target.value })} placeholder="ex.: OPENAI" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Tipo de match</label>
                <select className={inputCls} value={modalRegra.match_type} onChange={(e) => setModalRegra({ ...modalRegra, match_type: e.target.value as Regra['match_type'] })}>
                  <option value="contains">contém</option>
                  <option value="starts_with">começa com</option>
                  <option value="exact">exato</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Aplica em</label>
                <select className={inputCls} value={modalRegra.aplica_em} onChange={(e) => setModalRegra({ ...modalRegra, aplica_em: e.target.value as Regra['aplica_em'] })}>
                  <option value="ambos">ambos</option>
                  <option value="entries">lançamentos</option>
                  <option value="cartao">cartão</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Conta sugerida</label>
              <select className={inputCls} value={modalRegra.chart_of_account_id} onChange={(e) => setModalRegra({ ...modalRegra, chart_of_account_id: e.target.value })}>
                <option value="">Selecione a conta…</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Prioridade <span className="text-fg-subtle font-normal">(menor = avaliada primeiro)</span></label>
              <input type="number" className={inputCls} value={modalRegra.prioridade} onChange={(e) => setModalRegra({ ...modalRegra, prioridade: Number(e.target.value) })} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
