import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL } from '../lib/format'
import { exportTabelaCSV, exportTabelaXLSX } from '../lib/exportTabela'
import type { DreProduct } from '../lib/types'
import { Card, PageHeader, ErroBanner, Vazio, KPICard, KPIStrip, Button, inputCls } from '../components/ui'

// DRE gerencial POR PRODUTO (modelo do contador, aba "DRE Gerencial"): produtos
// nas colunas. Acima da Margem rateia por produto (receita/deduções/custos var,
// via dre_by_product). Abaixo da Margem é estrutura da empresa (não rateada) e
// aparece só na coluna Total.

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface Linha { dre_product_id: string | null; bloco: string; valor: number }

// chave de coluna: id do produto, ou '__nr__' p/ os sem produto (a classificar)
const NR = '__nr__'

function valCls(v: number): string {
  if (v > 0) return 'text-revenue'
  if (v < 0) return 'text-expense'
  return 'text-fg-subtle'
}

export default function DreProduto() {
  const { empresaAtiva } = useApp()
  const anoAtual = new Date().getFullYear()
  const [ano, setAno] = useState(anoAtual)
  const [mesDe, setMesDe] = useState(1)
  const [mesAte, setMesAte] = useState(12)
  const [dados, setDados] = useState<Linha[]>([])
  const [produtos, setProdutos] = useState<DreProduct[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    setErro(null)
    const [r1, r2] = await Promise.all([
      supabase.rpc('dre_by_product', {
        p_company: empresaAtiva.id, p_year: ano,
        p_month_from: Math.min(mesDe, mesAte), p_month_to: Math.max(mesDe, mesAte),
      }),
      supabase.from('dre_products').select('*').eq('active', true).order('sort_order'),
    ])
    setCarregando(false)
    if (r1.error) { setErro('Erro ao carregar a DRE por produto: ' + r1.error.message); setDados([]); return }
    setDados((r1.data as Linha[]) ?? [])
    setProdutos((r2.data as DreProduct[]) ?? [])
  }, [empresaAtiva, ano, mesDe, mesAte])

  useEffect(() => { carregar() }, [carregar])

  const view = useMemo(() => {
    // mapa coluna→bloco→valor
    const m = new Map<string, Record<string, number>>()
    const add = (col: string, bloco: string, v: number) => {
      const r = m.get(col) ?? {}
      r[bloco] = (r[bloco] ?? 0) + v
      m.set(col, r)
    }
    let despFixa = 0, financeiro = 0, depreciacao = 0, imposto = 0
    for (const l of dados) {
      if (l.bloco === 'despesa_fixa') despFixa += l.valor
      else if (l.bloco === 'financeiro') financeiro += l.valor
      else if (l.bloco === 'depreciacao') depreciacao += l.valor
      else if (l.bloco === 'imposto') imposto += l.valor
      else add(l.dre_product_id ?? NR, l.bloco, l.valor) // acima da margem (por produto)
    }

    // colunas de produto: os que têm algum valor acima da margem, na ordem do
    // sort_order; "(A classificar)" no fim se houver sem produto.
    const cols: { key: string; nome: string }[] = []
    for (const p of produtos) if (m.has(p.id)) cols.push({ key: p.id, nome: p.name })
    if (m.has(NR)) cols.push({ key: NR, nome: '(A classificar)' })

    const colVal = (key: string) => {
      const r = m.get(key) ?? {}
      const rb = r.receita_bruta ?? 0, ded = r.deducao ?? 0, cv = r.custo_variavel ?? 0
      const rl = rb - ded, mc = rl - cv
      return { rb, ded, rl, cv, mc }
    }
    const colsCalc = cols.map((c) => ({ ...c, ...colVal(c.key) }))
    const tot = colsCalc.reduce(
      (a, c) => ({ rb: a.rb + c.rb, ded: a.ded + c.ded, rl: a.rl + c.rl, cv: a.cv + c.cv, mc: a.mc + c.mc }),
      { rb: 0, ded: 0, rl: 0, cv: 0, mc: 0 }
    )
    const ebitda = tot.mc - despFixa
    const lair = ebitda - financeiro - depreciacao
    const lucro = lair - imposto

    return { cols: colsCalc, tot, despFixa, financeiro, depreciacao, imposto, ebitda, lair, lucro }
  }, [dados, produtos])

  const temDados = view.cols.length > 0
  const anos = Array.from({ length: anoAtual - 2019 + 2 }, (_, i) => 2020 + i)

  // Análise vertical: cada linha como % da Receita Bruta total (= 100%).
  const baseAV = view.tot.rb
  const avTexto = (total: number) => baseAV !== 0 ? (total / baseAV * 100).toFixed(1).replace('.', ',') + '%' : '—'

  const exportar = (formato: 'xlsx' | 'csv') => {
    const header = ['Linha', ...view.cols.map((c) => c.nome), 'Total', '% AV']
    const linhas: (string | number)[][] = []
    for (const ln of linhasProduto) {
      linhas.push([ln.label, ...view.cols.map((c) => c[ln.campo]), view.tot[ln.campo], avTexto(view.tot[ln.campo])])
    }
    for (const ln of linhasEstrutura) {
      linhas.push([ln.label, ...view.cols.map(() => ''), ln.valor, avTexto(ln.valor)])
    }
    const nome = `DRE-Produto_${(empresaAtiva?.name ?? 'empresa').replace(/\s+/g, '-')}_${ano}`
    if (formato === 'xlsx') exportTabelaXLSX(header, linhas, nome, 'DRE por Produto').catch(console.error)
    else exportTabelaCSV(header, linhas, nome)
  }

  // linhas "acima da margem" (por produto): [rótulo, seletor de campo, ehSubtotal]
  const linhasProduto: { label: string; campo: 'rb' | 'ded' | 'rl' | 'cv' | 'mc'; sub?: boolean }[] = [
    { label: 'Receita Bruta', campo: 'rb' },
    { label: '(−) Deduções', campo: 'ded' },
    { label: '(=) Receita Líquida', campo: 'rl', sub: true },
    { label: '(−) Custos Variáveis', campo: 'cv' },
    { label: '(=) Margem de Contribuição', campo: 'mc', sub: true },
  ]
  // linhas "estrutura" (empresa, só no Total)
  const linhasEstrutura: { label: string; valor: number; sub?: boolean }[] = [
    { label: '(−) Despesas Fixas', valor: view.despFixa },
    { label: '(=) EBITDA', valor: view.ebitda, sub: true },
    { label: '(±) Resultado Financeiro', valor: view.financeiro },
    { label: '(−) Depreciação', valor: view.depreciacao },
    { label: '(=) LAIR', valor: view.lair, sub: true },
    { label: '(−) IRPJ / CSLL', valor: view.imposto },
    { label: '(=) Lucro Líquido', valor: view.lucro, sub: true },
  ]

  return (
    <div>
      <PageHeader
        titulo="DRE por Produto"
        subtitulo="Margem de contribuição por produto (acima da margem rateia; estrutura é da empresa)"
        acao={temDados ? (
          <div className="flex gap-2">
            <Button variante="secondary" onClick={() => exportar('xlsx')}><Download size={16} /> Excel</Button>
            <Button variante="ghost" onClick={() => exportar('csv')}>CSV</Button>
          </div>
        ) : undefined}
      />

      <ErroBanner mensagem={erro} />

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1">Ano</label>
            <select className={inputCls} value={ano} onChange={(e) => setAno(Number(e.target.value))}>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1">De</label>
            <select className={inputCls} value={mesDe} onChange={(e) => setMesDe(Number(e.target.value))}>
              {MESES.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1">Até</label>
            <select className={inputCls} value={mesAte} onChange={(e) => setMesAte(Number(e.target.value))}>
              {MESES.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {carregando && (
        <Card className="p-6 flex justify-center"><span className="text-sm text-fg-subtle">Carregando…</span></Card>
      )}

      {!carregando && !temDados && (
        <Card>
          <Vazio mensagem={!empresaAtiva?.id ? 'Selecione uma empresa para visualizar a DRE por produto.' : 'Sem dados para o período selecionado.'} />
        </Card>
      )}

      {!carregando && temDados && (
        <div className="mb-4">
          <KPIStrip cols={4}>
            <KPICard label="Receita Líquida" valor={fmtBRL(view.tot.rl)} tom="revenue" />
            <KPICard label="Margem de Contribuição" valor={fmtBRL(view.tot.mc)} tom={view.tot.mc >= 0 ? 'revenue' : 'expense'} />
            <KPICard label="EBITDA" valor={fmtBRL(view.ebitda)} tom={view.ebitda >= 0 ? 'revenue' : 'expense'} />
            <KPICard label="Lucro Líquido" valor={fmtBRL(view.lucro)} tom={view.lucro >= 0 ? 'revenue' : 'expense'} />
          </KPIStrip>
        </div>
      )}

      {!carregando && temDados && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead>
                <tr className="border-b-2 border-border bg-surface-2">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-fg-muted uppercase tracking-wide min-w-[200px] sticky left-0 bg-surface-2 z-10">Linha</th>
                  {view.cols.map((c) => (
                    <th key={c.key} className="px-3 py-3 text-right text-xs font-semibold text-fg-muted uppercase tracking-wide min-w-[120px]">{c.nome}</th>
                  ))}
                  <th className="px-3 py-3 text-right text-xs font-semibold text-fg-muted uppercase tracking-wide min-w-[130px] border-l border-border">Total</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-fg-muted uppercase tracking-wide min-w-[64px]" title="Análise vertical — % sobre a Receita Bruta">% AV</th>
                </tr>
              </thead>
              <tbody>
                {/* acima da margem — por produto */}
                {linhasProduto.map((ln) => (
                  <tr key={ln.campo} className={ln.sub ? 'border-t-2 border-border-strong bg-surface-2' : 'border-b border-border'}>
                    <td className={`px-4 py-2 whitespace-nowrap sticky left-0 z-10 ${ln.sub ? 'font-bold text-fg bg-surface-2' : 'text-fg-muted bg-surface'}`}>{ln.label}</td>
                    {view.cols.map((c) => (
                      <td key={c.key} className={`px-3 py-2 text-right whitespace-nowrap ${ln.sub ? 'font-bold ' + valCls(c[ln.campo]) : valCls(c[ln.campo])}`}>{fmtBRL(c[ln.campo])}</td>
                    ))}
                    <td className={`px-3 py-2 text-right whitespace-nowrap border-l border-border font-bold ${valCls(view.tot[ln.campo])}`}>{fmtBRL(view.tot[ln.campo])}</td>
                    <td className="px-3 py-2 text-right tnum text-xs text-fg-subtle whitespace-nowrap">{avTexto(view.tot[ln.campo])}</td>
                  </tr>
                ))}
                {/* estrutura — empresa (só no Total) */}
                {linhasEstrutura.map((ln, i) => (
                  <tr key={i} className={ln.sub ? 'border-t-2 border-border-strong bg-canvas' : 'border-b border-border'}>
                    <td className={`px-4 py-2 whitespace-nowrap sticky left-0 z-10 ${ln.sub ? 'font-bold text-fg bg-canvas' : 'text-fg-muted bg-surface'}`}>{ln.label}</td>
                    <td colSpan={view.cols.length} className="px-3 py-2 text-right text-xs text-fg-subtle italic">estrutura da empresa →</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap border-l border-border font-bold ${valCls(ln.valor)}`}>{fmtBRL(ln.valor)}</td>
                    <td className="px-3 py-2 text-right tnum text-xs text-fg-subtle whitespace-nowrap">{avTexto(ln.valor)}</td>
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
