import { useCallback, useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, primeiroDiaMes, ultimoDiaMes } from '../lib/format'
import { CAT_CHART_COLORS, corDaCategoria } from '../lib/fatura'
import type { RelatorioCategoriaLinha } from '../lib/types'
import { Card, PageHeader, ErroBanner, Vazio, inputCls, btnSecundario } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'
import { exportTabelaCSV, exportTabelaXLSX } from '../lib/exportTabela'

// Relatório de categorias — consome a RPC relatorio_categorias (agrega no banco,
// passo 2/4 do bloco financeiro). Consolida cartão (texto) + lançamentos/extrato
// (FK) por categoria. Hotmart e Compras ficam fora por design (ver migration).
export default function RelatorioCategorias() {
  const { empresaAtiva } = useApp()
  const [de, setDe] = useState(primeiroDiaMes())
  const [ate, setAte] = useState(ultimoDiaMes())
  const [regime, setRegime] = useState<'competencia' | 'caixa'>('competencia')
  const [incCartao, setIncCartao] = useState(true)
  const [incEntries, setIncEntries] = useState(true)
  const [incExtrato, setIncExtrato] = useState(true)
  const [linhas, setLinhas] = useState<RelatorioCategoriaLinha[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    const { data, error } = await supabase.rpc('relatorio_categorias', {
      p_start: de || null, p_end: ate || null, p_company: empresaAtiva?.id ?? null,
      p_regime: regime, p_inc_cartao: incCartao, p_inc_entries: incEntries, p_inc_extrato: incExtrato,
    })
    if (error) { setErro('Erro ao carregar o relatório: ' + error.message); setLinhas([]); return }
    setLinhas(((data as RelatorioCategoriaLinha[] | null) ?? []).map((r) => ({
      categoria: r.categoria, color_index: r.color_index,
      despesa_cartao: Number(r.despesa_cartao), despesa_entries: Number(r.despesa_entries),
      receita_entries: Number(r.receita_entries), despesa_extrato: Number(r.despesa_extrato),
      receita_extrato: Number(r.receita_extrato), despesa_total: Number(r.despesa_total),
      receita_total: Number(r.receita_total), saldo: Number(r.saldo), n_lanc: Number(r.n_lanc),
    })))
  }, [de, ate, regime, incCartao, incEntries, incExtrato, empresaAtiva])

  useEffect(() => { carregar() }, [carregar])

  const totais = useMemo(() => ({
    despesa: linhas.reduce((s, l) => s + l.despesa_total, 0),
    receita: linhas.reduce((s, l) => s + l.receita_total, 0),
    saldo: linhas.reduce((s, l) => s + l.saldo, 0),
  }), [linhas])

  const pieData = useMemo(
    () => linhas.filter((l) => l.despesa_total > 0)
      .map((l) => ({ name: l.categoria, value: l.despesa_total, cor: CAT_CHART_COLORS[l.color_index % CAT_CHART_COLORS.length] })),
    [linhas]
  )

  const dim = (v: number) => (v ? fmtBRL(v) : <span className="text-slate-300">—</span>)
  const cols = useMemo<DataColumn<RelatorioCategoriaLinha>[]>(() => [
    { id: 'categoria', header: 'Categoria', size: 190, cell: (l) => (
        <span className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: corDaCategoria(l.color_index).text }} />
          <span className="font-medium text-slate-700">{l.categoria}</span>
        </span>
      ), footer: <span className="font-bold text-slate-800">Total</span> },
    { id: 'dc', header: 'Desp. cartão', size: 120, align: 'right', cell: (l) => <span className="tabular-nums text-slate-600">{dim(l.despesa_cartao)}</span> },
    { id: 'del', header: 'Desp. lançam.', size: 125, align: 'right', cell: (l) => <span className="tabular-nums text-slate-600">{dim(l.despesa_entries)}</span> },
    { id: 'rel', header: 'Rec. lançam.', size: 120, align: 'right', cell: (l) => <span className="tabular-nums text-emerald-700">{dim(l.receita_entries)}</span> },
    { id: 'dx', header: 'Desp. extrato', size: 120, align: 'right', cell: (l) => <span className="tabular-nums text-slate-600">{dim(l.despesa_extrato)}</span> },
    { id: 'rx', header: 'Rec. extrato', size: 115, align: 'right', cell: (l) => <span className="tabular-nums text-emerald-700">{dim(l.receita_extrato)}</span> },
    { id: 'dt', header: 'Despesa total', size: 130, align: 'right',
      cell: (l) => <span className="tabular-nums font-semibold text-slate-800">{fmtBRL(l.despesa_total)}</span>,
      footer: <span className="font-bold text-slate-800">{fmtBRL(totais.despesa)}</span> },
    { id: 'rt', header: 'Receita total', size: 130, align: 'right',
      cell: (l) => <span className="tabular-nums font-semibold text-emerald-700">{dim(l.receita_total)}</span>,
      footer: <span className="font-bold text-emerald-700">{fmtBRL(totais.receita)}</span> },
    { id: 'sld', header: 'Saldo', size: 130, align: 'right',
      cell: (l) => <span className={`tabular-nums font-semibold ${l.saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmtBRL(l.saldo)}</span>,
      footer: <span className={`font-bold ${totais.saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmtBRL(totais.saldo)}</span> },
    { id: 'n', header: 'Nº', size: 64, align: 'right', cell: (l) => <span className="tabular-nums text-slate-400">{l.n_lanc}</span> },
  ], [totais])

  const exportar = (tipo: 'csv' | 'xlsx') => {
    const header = ['Categoria', 'Desp. cartão', 'Desp. lançamentos', 'Rec. lançamentos', 'Desp. extrato', 'Rec. extrato', 'Despesa total', 'Receita total', 'Saldo', 'Nº']
    const rows = linhas.map((l) => [l.categoria, l.despesa_cartao, l.despesa_entries, l.receita_entries, l.despesa_extrato, l.receita_extrato, l.despesa_total, l.receita_total, l.saldo, l.n_lanc])
    const fname = `relatorio_categorias_${de}_a_${ate}`
    if (tipo === 'csv') exportTabelaCSV(header, rows, fname)
    else exportTabelaXLSX(header, rows, fname).catch(console.error)
  }

  const checkbox = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer select-none">
      <input type="checkbox" className="accent-indigo-600" checked={on} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <div>
      <PageHeader
        titulo="Relatório de categorias"
        subtitulo="Gastos e receitas por categoria — cartão, lançamentos e extrato consolidados"
        acao={
          <div className="flex gap-2">
            <button onClick={() => exportar('xlsx')} disabled={!linhas.length} className={btnSecundario + (!linhas.length ? ' opacity-40 pointer-events-none' : '')}>
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button onClick={() => exportar('csv')} disabled={!linhas.length} className={btnSecundario + (!linhas.length ? ' opacity-40 pointer-events-none' : '')}>
              <FileText size={16} /> CSV
            </button>
          </div>
        }
      />

      <ErroBanner mensagem={erro} />

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">De</label>
            <input type="date" className={inputCls} value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Até</label>
            <input type="date" className={inputCls} value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="w-44">
            <label className="block text-sm font-medium mb-1">Regime</label>
            <select className={inputCls} value={regime} onChange={(e) => setRegime(e.target.value as 'competencia' | 'caixa')}>
              <option value="competencia">Competência</option>
              <option value="caixa">Caixa</option>
            </select>
          </div>
          <div className="flex items-center gap-4 pb-2">
            {checkbox('Cartão', incCartao, setIncCartao)}
            {checkbox('Lançamentos', incEntries, setIncEntries)}
            {checkbox('Extrato', incExtrato, setIncExtrato)}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Despesa total</p>
          <p className="text-xl font-bold text-red-600 mt-1">{fmtBRL(totais.despesa)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Receita total</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{fmtBRL(totais.receita)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Saldo</p>
          <p className={`text-xl font-bold mt-1 ${totais.saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmtBRL(totais.saldo)}</p>
        </Card>
      </div>

      {linhas.length === 0 ? (
        <Card><Vazio mensagem="Sem dados para o período e os filtros selecionados." /></Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6 items-start">
          <Card className="p-3">
            <DataTable tableKey="relatorio-categorias" columns={cols} data={linhas} getRowId={(l) => l.categoria} />
          </Card>
          <Card className="p-4 min-w-72">
            <div className="font-bold text-sm text-slate-800 mb-2">Despesa por categoria</div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={1}>
                  {pieData.map((p, i) => <Cell key={i} fill={p.cor} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 mt-2">
              {pieData.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.cor }} />
                  <span className="text-slate-600 flex-1 truncate">{p.name}</span>
                  <span className="text-slate-400 tabular-nums">{fmtBRL(p.value)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
