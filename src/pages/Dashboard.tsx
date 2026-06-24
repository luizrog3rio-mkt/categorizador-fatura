import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, fmtData, hoje } from '../lib/format'
import { CAT_CHART_COLORS, fmt, valorComSinal } from '../lib/fatura'
import type { Entry, HotmartSale, Invoice } from '../lib/types'
import { Card, PageHeader, StatusBadge, ErroBanner, KPICard, KPIStrip } from '../components/ui'

interface MesAgg { mes: string; receber: number; pagar: number }
interface CatAgg { nome: string; valor: number; cor: string }
interface TxLite { amount: number; category: string | null; kind: 'debit' | 'credit' }
interface CatRow { name: string; color_index: number }

// Cores literais p/ recharts (não aceita classes Tailwind) — espelham os tokens.
const C = { revenue: '#047857', expense: '#be123c', brand: '#2b53c0', grid: '#e6e8ec', subtle: '#94a3b8' }

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle mb-3">{children}</h3>
}

// Dashboard "Razão Calma". Hero: Resultado do mês (assinatura) + A liberar
// (Hotmart). Personalidade nos números; cor só com função.
export default function Dashboard() {
  const { empresaAtiva } = useApp()
  const [lancamentos, setLancamentos] = useState<Entry[]>([])
  const [vendas, setVendas] = useState<HotmartSale[]>([])
  const [hotmartMesNet, setHotmartMesNet] = useState(0)
  const [aLiberar, setALiberar] = useState(0)
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

    // ── Hotmart líquido do MÊS via RPC (agregado no banco — exato a qualquer
    //    volume; o sum client-side trunca em 1000 linhas do PostgREST) ──
    const agora = new Date()
    const mIni = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`
    const mUlt = new Date(agora.getFullYear(), agora.getMonth() + 1, 0)
    const mFim = `${mUlt.getFullYear()}-${String(mUlt.getMonth() + 1).padStart(2, '0')}-${String(mUlt.getDate()).padStart(2, '0')}`
    const { data: ht, error: e6 } = await supabase.rpc('hotmart_totals', {
      p_company: empresaAtiva?.id ?? null, p_start: mIni, p_end: mFim,
    })
    if (e6) erros.push('hotmart totais: ' + e6.message)
    setHotmartMesNet(Number(ht?.[0]?.liquido ?? 0))

    // ── Hotmart a liberar (release_date futura) via RPC — agregado no banco ──
    const { data: al, error: e7 } = await supabase.rpc('hotmart_a_liberar', {
      p_company: empresaAtiva?.id ?? null,
    })
    if (e7) erros.push('hotmart a liberar: ' + e7.message)
    setALiberar(Number(al ?? 0))

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
  const mesLabel = new Date(+mesAtual.slice(0, 4), +mesAtual.slice(5, 7) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // ── cartão de crédito (real) ──────────────────────────────────────────────
  const cartao = useMemo(() => {
    const totalFaturas = invoices.reduce((s, i) => s + Number(i.total ?? 0), 0)
    const semCategoria = txs.filter((t) => !t.category).length
    const corDe = (nome: string) => {
      const idx = categorias.findIndex((c) => c.name === nome)
      return idx >= 0 ? CAT_CHART_COLORS[idx % CAT_CHART_COLORS.length] : C.subtle
    }
    const m = new Map<string, number>()
    for (const t of txs) {
      const nome = t.category || 'Sem categoria'
      m.set(nome, (m.get(nome) ?? 0) + valorComSinal(t))
    }
    const porCategoria: CatAgg[] = [...m.entries()]
      .map(([nome, valor]) => ({ nome, valor, cor: nome === 'Sem categoria' ? C.subtle : corDe(nome) }))
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
    return { aReceber, aPagar, atrasados }
  }, [lancamentos, mesAtual])

  // ── hero: resultado projetado do mês (entradas − saídas) ──
  const entradas = hotmartMesNet + kpis.aReceber
  const saidas = kpis.aPagar
  const resultado = entradas - saidas
  const positivo = resultado >= 0

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
    <div className="space-y-8">
      <PageHeader titulo="Dashboard" subtitulo={empresaAtiva ? empresaAtiva.name : 'Visão consolidada'} />

      <ErroBanner mensagem={erro} />

      {/* ══ HERO — assinatura: resultado do mês + a liberar (Hotmart) ══ */}
      <Card className="p-6">
        <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
          <div className="flex gap-4">
            <div className={`w-1.5 shrink-0 rounded-full ${positivo ? 'bg-revenue' : 'bg-expense'}`} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Resultado do mês · <span className="capitalize">{mesLabel}</span>
              </p>
              <p className={`mt-1 font-mono font-semibold tracking-tight tnum text-4xl sm:text-5xl ${positivo ? 'text-revenue' : 'text-expense'}`}>
                {positivo ? '+' : '−'}{fmtBRL(Math.abs(resultado))}
              </p>
              <p className="mt-2 text-xs text-fg-subtle tnum">
                Entradas <span className="text-revenue font-medium">{fmtBRL(entradas)}</span>
                {'  ·  '}
                Saídas <span className="text-expense font-medium">{fmtBRL(saidas)}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col justify-center md:border-l md:border-border md:pl-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">A liberar · Hotmart</p>
            <p className="mt-1 font-mono font-semibold tracking-tight tnum text-3xl text-brand">
              {fmtBRL(aLiberar)}
            </p>
            <p className="mt-1 text-xs text-fg-subtle">previsibilidade de saque</p>
          </div>
        </div>
      </Card>

      {/* ══ Contas a pagar & receber ══ */}
      <section>
        <Eyebrow>Contas a pagar &amp; receber</Eyebrow>
        <KPIStrip cols={4}>
          <KPICard bare label="A receber (mês)" valor={fmtBRL(kpis.aReceber)} tom="revenue" />
          <KPICard bare label="A pagar (mês)" valor={fmtBRL(kpis.aPagar)} tom="expense" />
          <KPICard bare label="Atrasados" valor={fmtBRL(kpis.atrasados)} tom={kpis.atrasados > 0 ? 'expense' : 'neutro'} />
          <KPICard bare label="Hotmart líquido (mês)" valor={fmtBRL(hotmartMesNet)} tom="revenue" />
        </KPIStrip>
      </section>

      {temFinanceiro && (
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="p-5">
            <h3 className="font-semibold text-fg mb-4">Fluxo de caixa por vencimento</h3>
            {fluxoMensal.length === 0 ? (
              <p className="text-sm text-fg-subtle py-8 text-center">Sem dados ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={fluxoMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="mes" fontSize={12} stroke={C.subtle} />
                  <YAxis fontSize={11} stroke={C.subtle} tickFormatter={(v: number) => (v / 1000).toFixed(0) + 'k'} />
                  <Tooltip formatter={(v) => fmtBRL(Number(v))} />
                  <Legend />
                  <Bar dataKey="receber" name="A receber" fill={C.revenue} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pagar" name="A pagar" fill={C.expense} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-fg mb-4">Próximos vencimentos</h3>
            {proximos.length === 0 ? (
              <p className="text-sm text-fg-subtle py-4 text-center">Nada vencendo em breve.</p>
            ) : (
              <ul className="divide-y divide-border">
                {proximos.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg truncate">{l.description}</p>
                      <p className="text-xs text-fg-subtle tnum">{fmtData(l.due_date)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-sm font-semibold tnum ${l.type === 'payable' ? 'text-expense' : 'text-revenue'}`}>
                        {l.type === 'payable' ? '−' : '+'}{fmtBRL(Number(l.amount))}
                      </span>
                      <StatusBadge status={l.status} tipo={l.type} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      {/* ══ Cartão de crédito ══ */}
      <section>
        <Eyebrow>Cartão de crédito</Eyebrow>
        <KPIStrip cols={4}>
          <KPICard bare label="Total das faturas" valor={fmt(cartao.totalFaturas)} />
          <KPICard bare label="Faturas" valor={cartao.qtdFaturas} />
          <KPICard bare label="Transações" valor={cartao.qtdTx} />
          <KPICard bare label="Sem categoria" valor={cartao.semCategoria} tom={cartao.semCategoria > 0 ? 'warning' : 'revenue'} />
        </KPIStrip>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="font-semibold text-fg mb-4">Gasto de cartão por categoria</h3>
          {cartao.porCategoria.length === 0 ? (
            <p className="text-sm text-fg-subtle py-8 text-center">Importe uma fatura para ver o gasto por categoria.</p>
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
          <h3 className="font-semibold text-fg mb-4">Gasto por fatura</h3>
          {cartao.porFatura.length === 0 ? (
            <p className="text-sm text-fg-subtle py-8 text-center">Nenhuma fatura importada ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cartao.porFatura}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="nome" fontSize={11} stroke={C.subtle} />
                <YAxis fontSize={11} stroke={C.subtle} tickFormatter={(v: number) => (v / 1000).toFixed(0) + 'k'} />
                <Tooltip formatter={(v) => fmtBRL(Number(v))} />
                <Bar dataKey="total" name="Total da fatura" fill={C.brand} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </section>

      {!temFinanceiro && (
        <Card className="p-8 text-center text-fg-subtle text-sm">
          Cadastre lançamentos em <span className="font-medium text-fg-muted">Contas a Pagar/Receber</span> e importe vendas na <span className="font-medium text-fg-muted">Hotmart</span> — o fluxo de caixa e os próximos vencimentos aparecem aqui.
        </Card>
      )}
    </div>
  )
}
