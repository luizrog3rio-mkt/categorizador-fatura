import { useCallback, useEffect, useState } from 'react'
import { Link2, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, fmtData } from '../lib/format'
import type { Account } from '../lib/types'
import { Card, PageHeader, ErroBanner, Vazio, Badge, inputCls, btnPrimario } from '../components/ui'

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
  const [contas, setContas] = useState<Account[]>([])
  const [contaId, setContaId] = useState('')
  const [summary, setSummary] = useState<ReconSummary | null>(null)
  const [linhas, setLinhas] = useState<BankLine[]>([])
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [erro, setErro] = useState<string | null>(null)

  // dados de UMA conta (imperativo — chamado ao selecionar/após ações, sem effect)
  const carregarDados = useCallback(async (acc: string) => {
    setSugestoes([])
    if (!acc) { setSummary(null); setLinhas([]); return }
    const { data: s } = await supabase.rpc('reconciliation_summary', { p_account: acc })
    setSummary((s as ReconSummary[] | null)?.[0] ?? null)
    const { data: bl, error } = await supabase.from('bank_transactions')
      .select('id,date,amount,memo,entry_id').eq('account_id', acc).order('date', { ascending: false })
    if (error) setErro('Erro ao carregar o extrato: ' + error.message)
    setLinhas((bl as BankLine[] | null) ?? [])
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

  const sugerir = async () => {
    if (!contaId) return
    const { data, error } = await supabase.rpc('reconciliation_suggest', { p_account: contaId, p_tolerance_days: 3, p_amount_tol: 0 })
    if (error) { setErro('Erro ao sugerir matches: ' + error.message); return }
    setSugestoes((data as Sugestao[] | null) ?? [])
  }

  const conciliar = async (bankTx: string, entry: string) => {
    const { error } = await supabase.rpc('reconcile_entry', { p_bank_tx: bankTx, p_entry: entry, p_mark_paid: true })
    if (error) { setErro('Erro ao conciliar: ' + error.message); return }
    await carregarDados(contaId)
    sugerir()
  }

  const desfazer = async (bankTx: string) => {
    if (!window.confirm('Desfazer a conciliação desta linha? O lançamento volta a "a pagar".')) return
    const { error } = await supabase.rpc('unreconcile_entry', { p_bank_tx: bankTx, p_revert_status: true })
    if (error) { setErro('Erro ao desfazer: ' + error.message); return }
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
                <button onClick={sugerir} disabled={!summary || summary.pendentes === 0} className={btnPrimario + (!summary || summary.pendentes === 0 ? ' opacity-40 pointer-events-none' : '')}>
                  <Sparkles size={16} /> Sugerir matches
                </button>
              )}
            </div>
          </Card>

          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { l: 'Linhas no extrato', v: String(summary.total) },
                { l: 'Conciliadas', v: String(summary.conciliadas) },
                { l: 'Pendentes', v: String(summary.pendentes) },
                { l: 'Valor pendente', v: fmtBRL(Number(summary.valor_pendente)) },
              ].map(({ l, v }) => (
                <Card key={l} className="p-4">
                  <p className="text-xs text-slate-500 uppercase">{l}</p>
                  <p className="text-lg font-bold text-slate-800 mt-1">{v}</p>
                </Card>
              ))}
            </div>
          )}

          {sugestoes.length > 0 && (
            <Card className="mb-6 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 font-bold text-sm text-slate-800">Sugestões de conciliação ({sugestoes.length})</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase border-b border-slate-100">
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
                    <tr key={`${s.bank_tx_id}-${s.entry_id}`} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-600"><span className="text-xs text-slate-400">{fmtData(s.bank_date)}</span> {s.bank_memo}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtBRL(Number(s.bank_amount))}</td>
                      <td className="px-4 py-2.5 text-slate-700">{s.entry_desc}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{fmtData(s.entry_due)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{s.diff_days}</td>
                      <td className="px-4 py-2.5 text-right">
                        {isAdmin && (
                          <button onClick={() => conciliar(s.bank_tx_id, s.entry_id)} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
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
            <div className="px-4 py-3 border-b border-slate-100 font-bold text-sm text-slate-800">Linhas do extrato</div>
            {linhas.length === 0 ? (
              <Vazio mensagem="Sem linhas de extrato nesta conta. Importe um OFX na tela Extratos (OFX) para começar." />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap w-24">{fmtData(l.date)}</td>
                      <td className="px-4 py-2.5 text-slate-700">{l.memo ?? '—'}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums w-32 ${Number(l.amount) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtBRL(Number(l.amount))}</td>
                      <td className="px-4 py-2.5 text-right w-40">
                        {l.entry_id ? (
                          <span className="inline-flex items-center gap-2 justify-end">
                            <Badge cor="#059669">Conciliado</Badge>
                            {isAdmin && <button title="Desfazer" onClick={() => desfazer(l.id)} className="text-slate-300 hover:text-red-500"><X size={14} /></button>}
                          </span>
                        ) : (
                          <Badge cor="#b45309">Pendente</Badge>
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
