import { useCallback, useEffect, useState } from 'react'
import { Link2, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, fmtData } from '../lib/format'
import type { Account } from '../lib/types'
import { Card, PageHeader, ErroBanner, Vazio, Badge, KPICard, KPIStrip, Button, inputCls } from '../components/ui'
import { useToast } from '../components/Toast'

// Conciliação bancária — casa linhas do extrato (bank_transactions) com contas a
// pagar/receber (entries) via as RPCs reconcile_*. Inerte até importar OFX numa
// conta corrente (passo 4/4 do bloco financeiro).

interface ReconSummary { total: number; conciliadas: number; pendentes: number; valor_pendente: number }
interface BankLine { id: string; date: string; amount: number; memo: string | null; entry_id: string | null }
interface Sugestao {
  bank_tx_id: string; bank_date: string; bank_amount: number; bank_memo: string | null
  entry_id: string; entry_desc: string; entry_amount: number; entry_due: string
  entry_type: string; diff_days: number; score: number
}

export default function Conciliacao() {
  const { empresaAtiva, isAdmin } = useApp()
  const toast = useToast()
  const [contas, setContas] = useState<Account[]>([])
  const [contaId, setContaId] = useState('')
  const [summary, setSummary] = useState<ReconSummary | null>(null)
  const [linhas, setLinhas] = useState<BankLine[]>([])
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  // dados de UMA conta (imperativo — chamado ao selecionar/após ações, sem effect)
  const carregarDados = useCallback(async (acc: string) => {
    setSugestoes([])
    if (!acc) { setSummary(null); setLinhas([]); return }
    setCarregando(true)
    const { data: s } = await supabase.rpc('reconciliation_summary', { p_account: acc })
    setSummary((s as ReconSummary[] | null)?.[0] ?? null)
    const { data: bl, error } = await supabase.from('bank_transactions')
      .select('id,date,amount,memo,entry_id').eq('account_id', acc).order('date', { ascending: false })
    if (error) setErro('Erro ao carregar o extrato: ' + error.message)
    setLinhas((bl as BankLine[] | null) ?? [])
    setCarregando(false)
  }, [])

  const carregarContas = useCallback(async () => {
    setErro(null)
    let q = supabase.from('accounts').select('*').eq('type', 'checking').eq('active', true).order('name')
    if (empresaAtiva) q = q.eq('company_id', empresaAtiva.id)
    const { data, error } = await q
    if (error) { setErro('Erro ao carregar contas: ' + error.message); return }
    const cts = (data as Account[]) ?? []
    setContas(cts)
    const first = cts[0]?.id ?? ''
    setContaId(first)
    carregarDados(first)
  }, [empresaAtiva, carregarDados])

  useEffect(() => { carregarContas() }, [carregarContas])

  const selecionar = (id: string) => { setContaId(id); carregarDados(id) }

  const sugerir = async (notificar = true) => {
    if (!contaId) return
    const { data, error } = await supabase.rpc('reconciliation_suggest', { p_account: contaId, p_tolerance_days: 3, p_amount_tol: 0 })
    if (error) { setErro('Erro ao sugerir matches: ' + error.message); return }
    const lista = (data as Sugestao[] | null) ?? []
    setSugestoes(lista)
    if (notificar) toast(lista.length ? `${lista.length} ${lista.length === 1 ? 'sugestão encontrada' : 'sugestões encontradas'}` : 'Nenhum match automático encontrado', lista.length ? 'success' : 'info')
  }

  const conciliar = async (bankTx: string, entry: string) => {
    const { error } = await supabase.rpc('reconcile_entry', { p_bank_tx: bankTx, p_entry: entry, p_mark_paid: true })
    if (error) { setErro('Erro ao conciliar: ' + error.message); return }
    await carregarDados(contaId)
    toast('Linha conciliada')
    sugerir(false)
  }

  const desfazer = async (bankTx: string) => {
    if (!window.confirm('Desfazer a conciliação desta linha? O lançamento volta a "a pagar".')) return
    const { error } = await supabase.rpc('unreconcile_entry', { p_bank_tx: bankTx, p_revert_status: true })
    if (error) { setErro('Erro ao desfazer: ' + error.message); return }
    toast('Conciliação desfeita', 'info')
    carregarDados(contaId)
  }

  return (
    <div>
      <PageHeader titulo="Conciliação bancária" subtitulo="Case as linhas do extrato com as contas a pagar e receber" />
      <ErroBanner mensagem={erro} />

      {contas.length === 0 ? (
        <Card><Vazio mensagem="Nenhuma conta corrente. Cadastre uma em Contas & Cartões e importe um extrato OFX." /></Card>
      ) : (
        <>
          <Card className="p-4 mb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-64">
                <label className="block text-sm font-medium mb-1">Conta corrente</label>
                <select className={inputCls} value={contaId} onChange={(e) => selecionar(e.target.value)}>
                  {contas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {isAdmin && (
                <Button variante="primary" onClick={() => sugerir()} disabled={!summary || summary.pendentes === 0}>
                  <Sparkles size={16} /> Sugerir matches
                </Button>
              )}
            </div>
          </Card>

          {summary && (
            <div className="mb-6">
              <KPIStrip cols={4}>
                <KPICard bare label="Linhas no extrato" valor={summary.total} />
                <KPICard bare label="Conciliadas" tom="revenue" valor={summary.conciliadas} />
                <KPICard bare label="Pendentes" tom="warning" valor={summary.pendentes} />
                <KPICard bare label="Valor pendente" tom="warning" valor={fmtBRL(Number(summary.valor_pendente))} />
              </KPIStrip>
            </div>
          )}

          {sugestoes.length > 0 && (
            <Card className="mb-6 overflow-hidden">
              <div className="px-4 py-3 border-b border-border font-bold text-sm text-fg">Sugestões de conciliação ({sugestoes.length})</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-fg-muted uppercase border-b border-border">
                    <th className="text-left px-4 py-2">Extrato</th>
                    <th className="text-right px-4 py-2">Valor</th>
                    <th className="text-left px-4 py-2">Lançamento</th>
                    <th className="text-right px-4 py-2">Venc.</th>
                    <th className="text-right px-4 py-2">Δ dias</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sugestoes.map((s) => (
                    <tr key={`${s.bank_tx_id}-${s.entry_id}`} className="border-b border-border hover:bg-surface-2">
                      <td className="px-4 py-2.5 text-fg-muted"><span className="text-xs text-fg-subtle">{fmtData(s.bank_date)}</span> {s.bank_memo}</td>
                      <td className="px-4 py-2.5 text-right tnum">{fmtBRL(Number(s.bank_amount))}</td>
                      <td className="px-4 py-2.5 text-fg-muted">{s.entry_desc}</td>
                      <td className="px-4 py-2.5 text-right text-fg-muted text-xs">{fmtData(s.entry_due)}</td>
                      <td className="px-4 py-2.5 text-right text-fg-subtle text-xs">{s.diff_days}</td>
                      <td className="px-4 py-2.5 text-right">
                        {isAdmin && (
                          <button onClick={() => conciliar(s.bank_tx_id, s.entry_id)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong">
                            <Link2 size={13} /> Conciliar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-bold text-sm text-fg">Linhas do extrato</div>
            {linhas.length === 0 ? (
              <Vazio mensagem={carregando ? 'Carregando…' : 'Sem linhas de extrato nesta conta. Importe um OFX na tela Extratos (OFX) para começar.'} />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id} className="border-b border-border hover:bg-surface-2">
                      <td className="px-4 py-2.5 text-xs text-fg-subtle whitespace-nowrap w-24">{fmtData(l.date)}</td>
                      <td className="px-4 py-2.5 text-fg-muted">{l.memo ?? '—'}</td>
                      <td className={`px-4 py-2.5 text-right tnum w-32 ${Number(l.amount) < 0 ? 'text-expense' : 'text-revenue'}`}>{fmtBRL(Number(l.amount))}</td>
                      <td className="px-4 py-2.5 text-right w-40">
                        {l.entry_id ? (
                          <span className="inline-flex items-center gap-2 justify-end">
                            <Badge tom="revenue">Conciliado</Badge>
                            {isAdmin && <button title="Desfazer" onClick={() => desfazer(l.id)} className="text-fg-subtle hover:text-expense"><X size={14} /></button>}
                          </span>
                        ) : (
                          <Badge tom="warning">Pendente</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
