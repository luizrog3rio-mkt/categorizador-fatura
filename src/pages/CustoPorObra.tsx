import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, Link2, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { useToast } from '../components/Toast'
import {
  PageHeader, Card, KPICard, KPIStrip, Vazio, Alert, ErroBanner, Button, Badge, inputCls,
} from '../components/ui'

// Tela "Custo por Obra" (Fase 4b-1 do roadmap DRE/Balanço). Espelha a aba "Custo por Obra" da
// planilha: quanto custou cada casa, quebrado por item de custo. Consome 2 RPCs read-only:
// custo_por_obra (o acumulado) e obra_candidatos (lançamentos cuja descrição nomeia a obra).
// O vínculo é REVISADO pelo humano — o sistema sugere, ele confirma (o backfill cego foi recusado).
// O custo em andamento fica em ESTOQUE. A conta pagadora é sempre escolhida pelo humano nesta tela;
// quando todas as contrapartidas fecham o razão, a venda baixa estoque e reconhece CPV atomicamente.

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
  account_id: string | null
  account_name: string | null
}
interface EntryConta {
  id: string
  account_id: string | null
  account: { name: string } | { name: string }[] | null
}
interface SituacaoObra {
  obra_id: string
  obra: string
  status: string
  data_venda: string | null
  total_custo: number
  qtd_custos: number
  qtd_sem_conta: number
  qtd_sem_partidas: number
  saldo_estoque_razao: number
  pronta_venda: boolean
  cpv_entry_id: string | null
}
interface ContrapartidaPendente {
  entry_id: string
  obra_id: string
  obra: string
  descricao: string
  valor: number
  data: string | null
  account_id: string | null
}
interface ContaPagadora {
  id: string
  name: string
  company_id: string
  type: string
  conta_contabil_id: string
  company: { name: string } | { name: string }[] | null
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
  const [situacoes, setSituacoes] = useState<SituacaoObra[]>([])
  const [contrapartidas, setContrapartidas] = useState<ContrapartidaPendente[]>([])
  const [contasPagadoras, setContasPagadoras] = useState<ContaPagadora[]>([])
  const [contaEscolhida, setContaEscolhida] = useState<Record<string, string>>({})
  const [datasVenda, setDatasVenda] = useState<Record<string, string>>({})
  const [salvandoConta, setSalvandoConta] = useState<string | null>(null)
  const [vendendo, setVendendo] = useState<string | null>(null)
  const [candidatosForaEmpresa, setCandidatosForaEmpresa] = useState(0)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null); setSel(new Set())
    const [cst, cnd, sit, ctr, acc] = await Promise.all([
      supabase.rpc('custo_por_obra', { p_company: empresaAtiva?.id ?? null }),
      supabase.rpc('obra_candidatos', { p_company: empresaAtiva?.id ?? null }),
      supabase.rpc('obra_situacao_contabil', { p_company: empresaAtiva?.id ?? null }),
      supabase.rpc('obra_contrapartidas_pendentes', { p_company: empresaAtiva?.id ?? null }),
      supabase.from('accounts')
        .select('id,name,company_id,type,conta_contabil_id,company:companies(name)')
        .eq('active', true)
        .not('conta_contabil_id', 'is', null)
        .order('name'),
    ])
    if (cst.error) setErro('Erro ao carregar o custo: ' + cst.error.message)
    else setLinhas(((cst.data as CustoLinha[]) ?? []).map((l) => ({ ...l, valor: Number(l.valor), qtd: Number(l.qtd) })))
    if (cnd.error) { setErro('Erro ao carregar candidatos: ' + cnd.error.message); setCandidatosForaEmpresa(0) }
    else {
      const cru = ((cnd.data as Omit<Candidato, 'account_id' | 'account_name'>[]) ?? [])
        .map((c) => ({ ...c, valor: Number(c.valor) }))
      // a RPC casa pela DESCRIÇÃO e pode trazer lançamento de OUTRA empresa que cita o nome
      // da obra — vincular esse contaminaria o custo/DRE. Filtra pro escopo da empresa ativa
      // e AVISA quantos ficaram de fora (podem ser lançamentos na empresa errada).
      const base = empresaAtiva ? cru.filter((c) => c.empresa === empresaAtiva.name) : cru
      setCandidatosForaEmpresa(cru.length - base.length)
      let contasPorEntry = new Map<string, { account_id: string | null; account_name: string | null }>()
      if (base.length > 0) {
        const { data: dadosConta, error: erroConta } = await supabase
          .from('entries')
          .select('id,account_id,account:accounts(name)')
          .in('id', base.map((c) => c.entry_id))
        if (erroConta) setErro('Erro ao carregar contas de pagamento: ' + erroConta.message)
        else {
          contasPorEntry = new Map(((dadosConta as EntryConta[]) ?? []).map((e) => {
            const conta = Array.isArray(e.account) ? e.account[0] : e.account
            return [e.id, { account_id: e.account_id, account_name: conta?.name ?? null }]
          }))
        }
      }
      setCandidatos(base.map((c) => ({
        ...c,
        account_id: contasPorEntry.get(c.entry_id)?.account_id ?? null,
        account_name: contasPorEntry.get(c.entry_id)?.account_name ?? null,
      })))
    }
    if (sit.error) setErro('Erro ao carregar a situação contábil: ' + sit.error.message)
    else setSituacoes(((sit.data as SituacaoObra[]) ?? []).map((s) => ({
      ...s,
      total_custo: Number(s.total_custo),
      qtd_custos: Number(s.qtd_custos),
      qtd_sem_conta: Number(s.qtd_sem_conta),
      qtd_sem_partidas: Number(s.qtd_sem_partidas),
      saldo_estoque_razao: Number(s.saldo_estoque_razao),
    })))
    if (ctr.error) setErro('Erro ao carregar contrapartidas: ' + ctr.error.message)
    else setContrapartidas(((ctr.data as ContrapartidaPendente[]) ?? []).map((c) => ({
      ...c, valor: Number(c.valor),
    })))
    if (acc.error) setErro('Erro ao carregar contas pagadoras: ' + acc.error.message)
    else setContasPagadoras((acc.data as ContaPagadora[]) ?? [])
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
  const valorContrapartidas = useMemo(
    () => contrapartidas.reduce((a, c) => a + c.valor, 0),
    [contrapartidas],
  )
  const situacaoPorObra = useMemo(
    () => new Map(situacoes.map((s) => [s.obra_id, s])),
    [situacoes],
  )

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

  const salvarContaPagadora = useCallback(async (entryId: string) => {
    const accountId = contaEscolhida[entryId]
    if (!accountId) return
    setSalvandoConta(entryId); setErro(null)
    const { error } = await supabase.rpc('definir_conta_pagadora_obra', {
      p_entry: entryId,
      p_account: accountId,
    })
    setSalvandoConta(null)
    if (error) { setErro('Erro ao definir conta pagadora: ' + error.message); return }
    toast('Conta pagadora salva e partida contábil criada.')
    setContaEscolhida((atual) => { const proximo = { ...atual }; delete proximo[entryId]; return proximo })
    carregar()
  }, [contaEscolhida, toast, carregar])

  const finalizarVenda = useCallback(async (obra: { id: string; nome: string; total: number }) => {
    const data = datasVenda[obra.id]
    if (!data) { setErro('Informe a data da venda.'); return }
    if (!window.confirm(`Finalizar a venda de ${obra.nome} e reconhecer ${fmtMoeda(obra.total)} em CPV?`)) return
    setVendendo(obra.id); setErro(null)
    const { error } = await supabase.rpc('finalizar_venda_obra', {
      p_obra: obra.id,
      p_data_venda: data,
    })
    setVendendo(null)
    if (error) { setErro('Erro ao finalizar venda: ' + error.message); return }
    toast(`Venda de ${obra.nome} finalizada. Estoque baixado para CPV.`)
    carregar()
  }, [datasVenda, toast, carregar])

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Custo por Obra"
        subtitulo="Revise custos, informe pela UI qual conta pagou e reconheça o CPV quando a obra for vendida."
      />
      <ErroBanner mensagem={erro} />

      <KPIStrip cols={4}>
        <KPICard bare label="Obras" valor={carregando ? '…' : obras.length} caption="da empresa selecionada" />
        <KPICard bare label="Custo acumulado" valor={carregando ? '…' : fmtMoeda(custoTotal)} tom="expense" caption="lançamentos já vinculados" />
        <KPICard bare label="A vincular" valor={carregando ? '…' : fmtMoeda(valorCandidatos)} tom="warning" caption={`${candidatos.length} lançamento${candidatos.length === 1 ? '' : 's'} sugerido${candidatos.length === 1 ? '' : 's'}`} />
        <KPICard bare label="Contrapartidas pendentes" valor={carregando ? '…' : contrapartidas.length} tom="warning" caption={fmtMoeda(valorContrapartidas)} />
      </KPIStrip>

      {!carregando && obras.length === 0 && (
        <Alert tom="info" titulo="Nenhuma obra nesta empresa">
          As obras hoje são da <strong>RB7 INCORPORADORA</strong>. Troque a empresa ativa no topo para vê-las.
        </Alert>
      )}

      {!carregando && !isAdmin && (candidatos.length > 0 || contrapartidas.length > 0) && (
        <Alert tom="warning" titulo="Só leitura">Seu perfil pode consultar, mas não pode alterar obras ou contrapartidas.</Alert>
      )}

      {!carregando && contrapartidas.length > 0 && (
        <Alert tom="warning" titulo="Contrapartida do Balanço ainda incompleta">
          {contrapartidas.length} lançamentos ({fmtMoeda(valorContrapartidas)}) ainda precisam da
          conta que realmente pagou. Escolha abaixo pela UI; nenhuma conta é inferida automaticamente.
        </Alert>
      )}

      {contrapartidas.length > 0 && (
        <Card>
          <div className="px-5 pt-4 pb-3 border-b border-border">
            <h3 className="font-medium text-fg">Contas pagadoras pendentes</h3>
            <p className="text-xs text-fg-subtle mt-0.5">Selecione a conta real. Ao salvar, o sistema cria D Estoque / C Caixa ou obrigação.</p>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-xs text-fg-subtle border-b border-border">
                  <th className="px-3 py-2 font-medium">Obra</th>
                  <th className="px-2 py-2 font-medium">Descrição</th>
                  <th className="px-2 py-2 font-medium">Data</th>
                  <th className="px-2 py-2 font-medium text-right">Valor</th>
                  <th className="px-3 py-2 font-medium min-w-72">Conta que pagou</th>
                  {isAdmin && <th className="px-3 py-2 w-24" />}
                </tr>
              </thead>
              <tbody>
                {contrapartidas.map((c) => (
                  <tr key={c.entry_id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2"><Badge tom="brand">{c.obra}</Badge></td>
                    <td className="px-2 py-2 text-fg">{c.descricao}</td>
                    <td className="px-2 py-2 text-fg-muted tnum">{fmtData(c.data)}</td>
                    <td className="px-2 py-2 text-right tnum text-fg">{fmtMoeda(c.valor)}</td>
                    <td className="px-3 py-2">
                      {isAdmin ? (
                        <select
                          className={inputCls}
                          aria-label={`Conta pagadora de ${c.descricao}`}
                          value={contaEscolhida[c.entry_id] ?? c.account_id ?? ''}
                          onChange={(e) => setContaEscolhida((atual) => ({ ...atual, [c.entry_id]: e.target.value }))}
                        >
                          <option value="">Selecione…</option>
                          {contasPagadoras.map((a) => {
                            const empresa = Array.isArray(a.company) ? a.company[0]?.name : a.company?.name
                            return <option key={a.id} value={a.id}>{a.name} — {empresa ?? 'empresa'}</option>
                          })}
                        </select>
                      ) : <Badge tom="warning">pendente</Badge>}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2 text-right">
                        <Button
                          tamanho="sm"
                          variante="secondary"
                          loading={salvandoConta === c.entry_id}
                          disabled={!(contaEscolhida[c.entry_id] ?? c.account_id)}
                          onClick={() => salvarContaPagadora(c.entry_id)}
                        >
                          <Save size={14} /> Salvar
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
                <span className="text-xs text-fg-subtle">— custo mantido em estoque</span>
              )}
            </div>
            <span className="text-lg font-mono tnum text-expense">{fmtMoeda(o.total)}</span>
          </div>
          {(() => {
            const situacao = situacaoPorObra.get(o.id)
            if (!situacao) return null
            if (o.status === 'vendida') {
              return (
                <div className="px-5 py-3 border-b border-border bg-revenue-bg text-sm text-fg-muted">
                  Estoque baixado e CPV reconhecido em <strong>{fmtData(o.data_venda)}</strong>.
                </div>
              )
            }
            return (
              <div className="px-5 py-3 border-b border-border bg-surface-2 flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-fg">Venda e reconhecimento do CPV</p>
                  <p className="text-xs text-fg-subtle mt-0.5">
                    {situacao.pronta_venda
                      ? `Razão completo: ${fmtMoeda(situacao.saldo_estoque_razao)} disponível para baixa.`
                      : `Aguardando ${situacao.qtd_sem_partidas} contrapartida${situacao.qtd_sem_partidas === 1 ? '' : 's'} pela UI.`}
                    {' '}O valor da venda continua sendo lançado em Contas a Receber.
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-end gap-2 flex-wrap">
                    <label className="text-xs text-fg-muted">
                      Data da venda
                      <input
                        type="date"
                        className={`${inputCls} mt-1 w-40`}
                        value={datasVenda[o.id] ?? ''}
                        onChange={(e) => setDatasVenda((atual) => ({ ...atual, [o.id]: e.target.value }))}
                      />
                    </label>
                    <Button
                      variante="primary"
                      loading={vendendo === o.id}
                      disabled={!situacao.pronta_venda || !datasVenda[o.id]}
                      onClick={() => finalizarVenda(o)}
                    >
                      <CircleDollarSign size={16} /> Finalizar venda e reconhecer CPV
                    </Button>
                  </div>
                )}
              </div>
            )
          })()}
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

      {!carregando && candidatosForaEmpresa > 0 && (
        <Alert tom="warning" titulo="Lançamentos de outra empresa citam nome de obra">
          {candidatosForaEmpresa} lançamento{candidatosForaEmpresa === 1 ? '' : 's'} de outra empresa
          {candidatosForaEmpresa === 1 ? ' menciona' : ' mencionam'} Alfenas/Cristais na descrição e
          {candidatosForaEmpresa === 1 ? ' foi ocultado' : ' foram ocultados'} desta lista (vincular
          contaminaria o custo da obra). Se for custo de obra lançado na empresa errada, corrija a
          empresa do lançamento em Contas a Pagar.
        </Alert>
      )}

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
                  <th className="px-2 py-2 font-medium">Conta de pagamento</th>
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
                    <td className="px-2 py-2 text-xs">
                      {c.account_name
                        ? <span className="text-fg-muted">{c.account_name}</span>
                        : <Badge tom="warning">sem conta</Badge>}
                    </td>
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
