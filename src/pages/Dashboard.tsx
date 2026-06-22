import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, fmtData, hoje } from '../lib/format'
import { vendaAprovada } from '../lib/hotmart'
import { CAT_CHART_COLORS, fmt, valorComSinal } from '../lib/fatura'
import type { Entry, HotmartSale, Invoice } from '../lib/types'
import { Card, PageHeader, StatusBadge, ErroBanner } from '../components/ui'

interface MesAgg { mes: string; receber: number; pagar: number }
interface CatAgg { nome: string; valor: number; cor: string }
interface TxLite { amount: number; category: string | null; kind: 'debit' | 'credit' }
interface CatRow { name: string; color_index: number }

// Etapa 7 — Dashboard HÍBRIDO. Topo: cartão de crédito (dados reais das
// faturas/transações vivas). Base: financeiro do rb7 (a pagar/receber/Hotmart
// de entries+hotmart_sales — preenche conforme o uso).
export default function Dashboard() {
  const { empresaAtiva } = useApp()
  const [lancamentos, setLancamentos] = useState<Entry[]>([])
  const [vendas, setVendas] = useState<HotmartSale[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [txs, setTxs] = useState<TxLite[]>([])
  const [categorias, setCategorias] = useState<CatRow[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    const erros: string[] = []
    // ── janela do fluxo financeiro: -5 a +2 meses ──
    const ini = new Date()
    ini.setMonth(ini.getMonth() - 5)
    const inicio = `${ini.getFullYear()}-${String(ini.getMonth() + 1).padStart(2, '0')}-01`
    const fim = new Date()
    fim.setMonth(fim.getMonth() + 2)
    const fimUlt = new Date(fim.getFullYear(), fim.getMonth() + 1, 0)
    const fimStr = `${fimUlt.getFullYear()}-${String(fimUlt.getMonth() + 1).padStart(2, '0')}-${String(fimUlt.getDate()).padStart(2, '0')}`

    let ql = supabase.from('entries').select('*').neq('status', 'cancelled').gte('due_date', inicio).lte('due_date', fimStr)
    if (empresaAtiva) ql = ql.eq('company_id', empresaAtiva.id)
    const { data: ls, error: e1 } = await ql
    if (e1) erros.push('lançamentos: ' + e1.message)
    setLancamentos((ls as Entry[]) ?? [])

    let qv = supabase.from('hotmart_sales').select('*').gte('sale_date', inicio)
    if (empresaAtiva) qv = qv.eq('company_id', empresaAtiva.id)
    const { data: vs, error: e2 } = await qv
    if (e2) erros.push('hotmart: ' + e2.message)
    setVendas((vs as HotmartSale[]) ?? [])

    // ── cartão: dados reais (faturas/transações vivas) ──
    const { data: invs, error: e3 } = await supabase.from('invoices').select('*').order('imported_at', { ascending: false })
    if (e3) erros.push('faturas: ' + e3.message)
    setInvoices(invs ?? [])
    const { data: tx, error: e4 } = await supabase.from('transactions').select('amount, category, kind')
    if (e4) erros.push('transações: ' + e4.message)
    setTxs((tx as TxLite[]) ?? [])
    const { data: cats, error: e5 } = await supabase.from('categories').select('name, color_index').order('created_at')
    if (e5) erros.push('categorias: ' + e5.message)
    setCategorias(cats ?? [])

    if (erros.length) setErro('Erro ao carregar o dashboard — os números podem estar incompletos. ' + erros.join(' · '))
  }, [empresaAtiva])

  useEffect(() => { carregar() }, [carregar])

  const mesAtual = hoje().slice(0, 7)

  // ── cartão de crédito (real) ──────────────────────────────────────────────
  const cartao = useMemo(() => {
    const totalFaturas = invoices.reduce((s, i) => s + Number(i.total ?? 0), 0)
    const semCategoria = txs.filter((t) => !t.category).length
    const corDe = (nome: string) => {
      const idx = categorias.findIndex((c) => c.name === nome)
      return idx >= 0 ? CAT_CHART_COLORS[idx % CAT_CHART_COLORS.length] : '#94a3b8'
    }
    const m = new Map<string, number>()
    for (const t of txs) {
      const nome = t.category || 'Sem categoria'
      m.set(nome, (m.get(nome) ?? 0) + valorComSinal(t))
    }
    const porCategoria: CatAgg[] = [...m.entries()]
      .map(([nome, valor]) => ({ nome, valor, cor: nome === 'Sem categoria' ? '#94a3b8' : corDe(nome) }))
      .sort((a, b) => b.valor - a.valor)
    const porFatura = invoices
      .map((i) => ({ nome: (i.name ?? 'Fatura').slice(0, 16), total: Number(i.total ?? 0) }))
      .reverse()
    return { totalFaturas, qtdFaturas: invoices.length, qtdTx: txs.length, semCategoria, porCategoria, porFatura }
  }, [invoices, txs, categorias])

  // ── financeiro rb7 (entries + hotmart) ────────────────────────────────────
  const kpis = useMemo(() => {
    const doMes = lancamentos.filter((l) => l.due_date.startsWith(mesAtual))
    const aReceber = doMes.filter((l) => l.type === 'receivable' && l.status !== 'paid').reduce((s, l) => s + Number(l.amount), 0)
    const aPagar = doMes.filter((l) => l.type === 'payable' && l.status !== 'paid').reduce((s, l) => s + Number(l.amount), 0)
    const atrasados = lancamentos.filter((l) => (l.status === 'to_pay' || l.status === 'pending') && l.due_date < hoje()).reduce((s, l) => s + Number(l.amount), 0)
    const hotmartMes = vendas.filter((v) => v.sale_date.startsWith(mesAtual) && vendaAprovada(v.status)).reduce((s, v) => s + Number(v.net_amount), 0)
    const aLiberar = vendas.filter((v) => v.release_date && v.release_date >= hoje() && vendaAprovada(v.status)).reduce((s, v) => s + Number(v.net_amount), 0)
    return { aReceber, aPagar, atrasados, hotmartMes, aLiberar }
  }, [lancamentos, vendas, mesAtual])

  const fluxoMensal: MesAgg[] = useMemo(() => {
    const m = new Map<string, MesAgg>()
    for (const l of lancamentos) {
      const mes = l.due_date.slice(0, 7)
      if (!m.has(mes)) m.set(mes, { mes, receber: 0, pagar: 0 })
      const agg = m.get(mes)!
      if (l.type === 'receivable') agg.receber += Number(l.amount)
      else agg.pagar += Number(l.amount)
    }
    return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((x) => ({ ...x, mes: x.mes.slice(5) + '/' + x.mes.slice(2, 4) }))
  }, [lancamentos])

  const proximos = useMemo(
    () => lancamentos.filter((l) => l.status !== 'paid' && l.due_date >= hoje()).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 8),
    [lancamentos]
  )

  const temFinanceiro = lancamentos.length > 0 || vendas.length > 0

  return (
    <div>
      <PageHeader titulo="Dashboard" subtitulo={empresaAtiva ? empresaAtiva.name : 'Visão consolidada'} />

      <ErroBanner mensagem={erro} />

      {/* ── Cartão de crédito (dados reais) ── */}
      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">💳 Cartão de crédito</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Total das faturas</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{fmt(cartao.totalFaturas)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Faturas</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{cartao.qtdFaturas}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Transações</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{cartao.qtdTx}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Sem categoria</p>
          <p className={`text-lg font-bold mt-1 ${cartao.semCategoria > 0 ? 'text-amber-600' : 'text-green-600'}`}>{cartao.semCategoria}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <Card className="p-5">
          <h3 className="font-semibold text-slate-700 mb-4">Gasto de cartão por categoria</h3>
          {cartao.porCategoria.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">Importe uma fatura para ver o gasto por categoria.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={cartao.porCategoria} dataKey="valor" nameKey="nome" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {cartao.porCategoria.map((c) => <Cell key={c.nome} fill={c.cor} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtBRL(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-slate-700 mb-4">Gasto por fatura</h3>
          {cartao.porFatura.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">Nenhuma fatura importada ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cartao.porFatura}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="nome" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v: number) => (v / 1000).toFixed(0) + 'k'} />
                <Tooltip formatter={(v) => fmtBRL(Number(v))} />
                <Bar dataKey="total" name="Total da fatura" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Financeiro (entries + hotmart) ── */}
      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">📊 Contas a pagar &amp; receber</h3>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">A receber (mês)</p>
          <p className="text-lg font-bold text-green-600 mt-1">{fmtBRL(kpis.aReceber)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">A pagar (mês)</p>
          <p className="text-lg font-bold text-amber-600 mt-1">{fmtBRL(kpis.aPagar)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Atrasados</p>
          <p className="text-lg font-bold text-red-600 mt-1">{fmtBRL(kpis.atrasados)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Hotmart líquido (mês)</p>
          <p className="text-lg font-bold text-emerald-600 mt-1">{fmtBRL(kpis.hotmartMes)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Hotmart a liberar</p>
          <p className="text-lg font-bold text-indigo-600 mt-1">{fmtBRL(kpis.aLiberar)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">previsibilidade de saque</p>
        </Card>
      </div>

      {!temFinanceiro ? (
        <Card className="p-8 text-center text-slate-400 text-sm">
          Cadastre lançamentos em <span className="font-medium">Contas a Pagar/Receber</span> e importe vendas na <span className="font-medium">Hotmart</span> — o fluxo de caixa e os próximos vencimentos aparecem aqui.
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="p-5">
            <h3 className="font-semibold text-slate-700 mb-4">Fluxo de caixa por vencimento</h3>
            {fluxoMensal.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">Sem dados ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={fluxoMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" fontSize={12} />
                  <YAxis fontSize={11} tickFormatter={(v: number) => (v / 1000).toFixed(0) + 'k'} />
                  <Tooltip formatter={(v) => fmtBRL(Number(v))} />
                  <Legend />
                  <Bar dataKey="receber" name="A receber" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pagar" name="A pagar" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-slate-700 mb-4">Próximos vencimentos</h3>
            {proximos.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Nada vencendo em breve.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {proximos.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{l.description}</p>
                      <p className="text-xs text-slate-400">{fmtData(l.due_date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold ${l.type === 'payable' ? 'text-red-600' : 'text-green-600'}`}>
                        {l.type === 'payable' ? '-' : '+'}{fmtBRL(Number(l.amount))}
                      </span>
                      <StatusBadge status={l.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
