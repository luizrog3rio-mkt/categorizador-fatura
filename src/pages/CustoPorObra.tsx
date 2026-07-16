import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { useToast } from '../components/Toast'
import {
  PageHeader, Card, KPICard, KPIStrip, Vazio, Alert, ErroBanner, Button, Badge,
} from '../components/ui'

// Tela "Custo por Obra" (Fase 4b-1 do roadmap DRE/Balanço). Espelha a aba "Custo por Obra" da
// planilha: quanto custou cada casa, quebrado por item de custo. Consome 2 RPCs read-only:
// custo_por_obra (o acumulado) e obra_candidatos (lançamentos cuja descrição nomeia a obra).
// O vínculo é REVISADO pelo humano — o sistema sugere, ele confirma (o backfill cego foi recusado).
// ⚠️ Enquanto a obra está em_andamento o custo dela é ESTOQUE (não deveria ir à DRE). Isso é a
// Fase 4b-2 (conta de estoque + evento de venda → CPV); hoje esses lançamentos ainda caem na DRE.

interface CustoLinha {
  obra_id: string
  obra: string
  status: string
  data_venda: string | null
  conta_code: string
  conta_name: string
  valor: number
  qtd: number
}
interface Candidato {
  entry_id: string
  descricao: string | null
  valor: number
  data: string | null
  empresa: string
  conta_code: string | null
  obra_id: string
  obra_sugerida: string
}

const fmtMoeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')

export default function CustoPorObra() {
  const { empresaAtiva, isAdmin } = useApp()
  const toast = useToast()

  const [linhas, setLinhas] = useState<CustoLinha[]>([])
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null); setSel(new Set())
    const [cst, cnd] = await Promise.all([
      supabase.rpc('custo_por_obra', { p_company: empresaAtiva?.id ?? null }),
      supabase.rpc('obra_candidatos', { p_company: empresaAtiva?.id ?? null }),
    ])
    if (cst.error) setErro('Erro ao carregar o custo: ' + cst.error.message)
    else setLinhas(((cst.data as CustoLinha[]) ?? []).map((l) => ({ ...l, valor: Number(l.valor), qtd: Number(l.qtd) })))
    if (cnd.error) setErro('Erro ao carregar candidatos: ' + cnd.error.message)
    else setCandidatos(((cnd.data as Candidato[]) ?? []).map((c) => ({ ...c, valor: Number(c.valor) })))
    setCarregando(false)
  }, [empresaAtiva])

  useEffect(() => { carregar() }, [carregar])

  // agrupa as linhas (obra × conta) em obras
  const obras = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; status: string; data_venda: string | null; total: number; itens: CustoLinha[] }>()
    for (const l of linhas) {
      if (!m.has(l.obra_id)) m.set(l.obra_id, { id: l.obra_id, nome: l.obra, status: l.status, data_venda: l.data_venda, total: 0, itens: [] })
      const o = m.get(l.obra_id)!
      if (l.qtd > 0) { o.total += l.valor; o.itens.push(l) }
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [linhas])

  const custoTotal = useMemo(() => obras.reduce((a, o) => a + o.total, 0), [obras])
  const valorCandidatos = useMemo(() => candidatos.reduce((a, c) => a + c.valor, 0), [candidatos])

  const toggle = (id: string) =>
    setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selecionarTodos = () => setSel(new Set(candidatos.map((c) => c.entry_id)))
  const limpar = () => setSel(new Set())

  // Vincula os selecionados à obra SUGERIDA (agrupa por obra → 1 update por obra).
  const vincular = useCallback(async () => {
    const alvos = candidatos.filter((c) => sel.has(c.entry_id))
    if (!alvos.length) return
    setSalvando(true); setErro(null)
    const porObra = new Map<string, string[]>()
    for (const a of alvos) {
      if (!porObra.has(a.obra_id)) porObra.set(a.obra_id, [])
      porObra.get(a.obra_id)!.push(a.entry_id)
    }
    let ok = 0
    for (const [obraId, ids] of porObra) {
      const { error } = await supabase.from('entries').update({ obra_id: obraId }).in('id', ids)
      if (error) { setErro('Erro ao vincular: ' + error.message); setSalvando(false); return }
      ok += ids.length
    }
    setSalvando(false)
    toast(`${ok} ${ok === 1 ? 'lançamento vinculado' : 'lançamentos vinculados'} à obra.`)
    carregar()
  }, [candidatos, sel, toast, carregar])

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Custo por Obra"
        subtitulo="Quanto custou cada casa, por item de custo. Os lançamentos que nomeiam a obra são sugeridos — você revisa e vincula."
      />
      <ErroBanner mensagem={erro} />

      <KPIStrip cols={3}>
        <KPICard bare label="Obras" valor={carregando ? '…' : obras.length} caption="da empresa selecionada" />
        <KPICard bare label="Custo acumulado" valor={carregando ? '…' : fmtMoeda(custoTotal)} tom="expense" caption="lançamentos já vinculados" />
        <KPICard bare label="A vincular" valor={carregando ? '…' : fmtMoeda(valorCandidatos)} tom="warning" caption={`${candidatos.length} lançamento${candidatos.length === 1 ? '' : 's'} sugerido${candidatos.length === 1 ? '' : 's'}`} />
      </KPIStrip>

      {!carregando && obras.length === 0 && (
        <Alert tom="info" titulo="Nenhuma obra nesta empresa">
          As obras hoje são da <strong>RB7 INCORPORADORA</strong>. Troque a empresa ativa no topo para vê-las.
        </Alert>
      )}

      {!carregando && !isAdmin && candidatos.length > 0 && (
        <Alert tom="warning" titulo="Só leitura">Seu perfil não pode vincular lançamentos a obras.</Alert>
      )}

      {/* Custo acumulado por obra */}
      {obras.map((o) => (
        <Card key={o.id}>
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-fg">{o.nome}</h3>
              <Badge tom={o.status === 'vendida' ? 'revenue' : 'warning'}>
                {o.status === 'vendida' ? `vendida ${fmtData(o.data_venda)}` : 'em andamento'}
              </Badge>
              {o.status !== 'vendida' && (
                <span className="text-xs text-fg-subtle">— custo é estoque (ainda não vai à DRE como CPV)</span>
              )}
            </div>
            <span className="text-lg font-mono tnum text-expense">{fmtMoeda(o.total)}</span>
          </div>
          {o.itens.length === 0 ? (
            <Vazio mensagem="Nenhum lançamento vinculado ainda — use a lista de sugestões abaixo." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-subtle border-b border-border">
                  <th className="px-4 py-2 font-medium">Item de custo (conta)</th>
                  <th className="px-2 py-2 font-medium text-right">Lançamentos</th>
                  <th className="px-4 py-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {o.itens.map((i) => (
                  <tr key={o.id + i.conta_code} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs text-fg-muted">{i.conta_code}</span>{' '}
                      <span className="text-fg">{i.conta_name}</span>
                    </td>
                    <td className="px-2 py-2 text-right tnum text-fg-muted">{i.qtd}</td>
                    <td className="px-4 py-2 text-right tnum text-fg">{fmtMoeda(i.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ))}

      {/* Candidatos a vincular */}
      {candidatos.length > 0 && (
        <Card>
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-medium text-fg">Lançamentos sugeridos</h3>
              <p className="text-xs text-fg-subtle mt-0.5">A descrição nomeia a obra. Revise antes de vincular.</p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 flex-wrap">
                {sel.size > 0 && <span className="text-xs text-fg-subtle tnum">{sel.size} selecionado{sel.size > 1 ? 's' : ''}</span>}
                <Button tamanho="sm" variante="secondary" onClick={sel.size === candidatos.length ? limpar : selecionarTodos}>
                  {sel.size === candidatos.length ? 'limpar' : 'selecionar todos'}
                </Button>
                <Button tamanho="sm" variante="primary" loading={salvando} disabled={sel.size === 0} onClick={vincular}>
                  <Link2 size={14} /> Vincular à obra sugerida
                </Button>
              </div>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-xs text-fg-subtle border-b border-border">
                  {isAdmin && (
                    <th className="w-8 px-3 py-2">
                      <input type="checkbox" checked={sel.size > 0 && sel.size === candidatos.length} onChange={(e) => (e.target.checked ? selecionarTodos() : limpar())} />
                    </th>
                  )}
                  <th className="px-2 py-2 font-medium">Descrição</th>
                  <th className="px-2 py-2 font-medium">Empresa</th>
                  <th className="px-2 py-2 font-medium">Data</th>
                  <th className="px-2 py-2 font-medium text-right">Valor</th>
                  <th className="px-3 py-2 font-medium">Obra sugerida</th>
                </tr>
              </thead>
              <tbody>
                {candidatos.map((c) => (
                  <tr key={c.entry_id} className="border-b border-border/50 last:border-0 hover:bg-surface-2">
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={sel.has(c.entry_id)} onChange={() => toggle(c.entry_id)} />
                      </td>
                    )}
                    <td className="px-2 py-2 text-fg">{c.descricao ?? '—'}</td>
                    <td className="px-2 py-2 text-xs text-fg-muted">{c.empresa}</td>
                    <td className="px-2 py-2 text-fg-muted tnum">{fmtData(c.data)}</td>
                    <td className="px-2 py-2 text-right tnum text-fg">{fmtMoeda(c.valor)}</td>
                    <td className="px-3 py-2"><Badge tom="brand">{c.obra_sugerida}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
