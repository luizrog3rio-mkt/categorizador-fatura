import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, FileSpreadsheet, FileText, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL } from '../lib/format'
import type { DreLinha } from '../lib/types'
import { Card, PageHeader, ErroBanner, Vazio, inputCls, btnSecundario } from '../components/ui'
import { exportTabelaCSV, exportTabelaXLSX } from '../lib/exportTabela'

// DRE gerencial por margem de contribuição (estrutura do Excel da RB7). v1:
// consolidada (TOTAL) + receita por produto via Hotmart. Consome a RPC
// dre_competencia (agrega no banco) e monta a cascata + subtotais no cliente.

type Linha =
  | { kind: 'bloco'; rotulo: string; bloco: string; valor: number }
  | { kind: 'subtotal'; rotulo: string; valor: number }

export default function DRE() {
  const { empresaAtiva } = useApp()
  const anoAtual = new Date().getFullYear()
  const [de, setDe] = useState(`${anoAtual}-01-01`)
  const [ate, setAte] = useState(`${anoAtual}-12-31`)
  const [dados, setDados] = useState<DreLinha[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())

  const carregar = useCallback(async () => {
    setErro(null)
    const { data, error } = await supabase.rpc('dre_competencia', {
      p_company: empresaAtiva?.id ?? null, p_start: de || null, p_end: ate || null, p_currency: 'BRL',
    })
    if (error) { setErro('Erro ao carregar a DRE: ' + error.message); setDados([]); return }
    setDados(((data as DreLinha[] | null) ?? []).map((l) => ({ bloco: l.bloco, categoria: l.categoria, valor: Number(l.valor) })))
  }, [de, ate, empresaAtiva])

  useEffect(() => { carregar() }, [carregar])

  const { cascata, detalhe, naoClassificado } = useMemo(() => {
    const det: Record<string, DreLinha[]> = {}
    for (const l of dados) (det[l.bloco] ??= []).push(l)
    for (const b in det) det[b].sort((a, c) => c.valor - a.valor)
    const sum = (b: string) => (det[b] ?? []).reduce((s, l) => s + l.valor, 0)

    const receitaBruta = sum('Receita Bruta')
    const deducoes = sum('Dedução')
    const receitaLiq = receitaBruta - deducoes
    const custoVar = sum('Custo Variável')
    const margem = receitaLiq - custoVar
    const despFixa = sum('Despesa Fixa')
    const ebitda = margem - despFixa
    const resFin = sum('Resultado Financeiro')
    const impLucro = sum('Imposto s/ Lucro')
    const naoClass = sum('Não classificado')
    const lucro = ebitda - resFin - impLucro - naoClass

    const c: Linha[] = [
      { kind: 'bloco', rotulo: 'Receita Bruta', bloco: 'Receita Bruta', valor: receitaBruta },
      { kind: 'bloco', rotulo: '(−) Deduções', bloco: 'Dedução', valor: deducoes },
      { kind: 'subtotal', rotulo: '(=) Receita Líquida', valor: receitaLiq },
      { kind: 'bloco', rotulo: '(−) Custos Variáveis', bloco: 'Custo Variável', valor: custoVar },
      { kind: 'subtotal', rotulo: '(=) Margem de Contribuição', valor: margem },
      { kind: 'bloco', rotulo: '(−) Despesas Fixas', bloco: 'Despesa Fixa', valor: despFixa },
      { kind: 'subtotal', rotulo: '(=) EBITDA', valor: ebitda },
      { kind: 'bloco', rotulo: '(−) Resultado Financeiro', bloco: 'Resultado Financeiro', valor: resFin },
      { kind: 'bloco', rotulo: '(−) Impostos s/ Lucro', bloco: 'Imposto s/ Lucro', valor: impLucro },
      ...(naoClass !== 0 ? [{ kind: 'bloco', rotulo: '(−) Não classificado', bloco: 'Não classificado', valor: naoClass } as Linha] : []),
      { kind: 'subtotal', rotulo: '(=) Lucro Líquido', valor: lucro },
    ]
    return { cascata: c, detalhe: det, naoClassificado: naoClass }
  }, [dados])

  const toggle = (b: string) => setAbertos((prev) => {
    const n = new Set(prev)
    if (n.has(b)) n.delete(b); else n.add(b)
    return n
  })

  const exportar = (tipo: 'csv' | 'xlsx') => {
    const rows = cascata.map((l) => [l.rotulo.replace(/[()=−]/g, '').trim(), l.kind === 'subtotal' ? l.valor : (l.rotulo.startsWith('(−)') || l.rotulo.startsWith('(-)') ? -l.valor : l.valor)])
    const fname = `dre_${de}_a_${ate}`
    if (tipo === 'csv') exportTabelaCSV(['Linha da DRE', 'Valor'], rows, fname)
    else exportTabelaXLSX(['Linha da DRE', 'Valor'], rows, fname, 'DRE').catch(console.error)
  }

  const temDados = dados.length > 0

  return (
    <div>
      <PageHeader
        titulo="DRE"
        subtitulo="Demonstração do resultado por margem de contribuição (competência)"
        acao={
          <div className="flex gap-2">
            <button onClick={() => exportar('xlsx')} disabled={!temDados} className={btnSecundario + (!temDados ? ' opacity-40 pointer-events-none' : '')}>
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button onClick={() => exportar('csv')} disabled={!temDados} className={btnSecundario + (!temDados ? ' opacity-40 pointer-events-none' : '')}>
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
          <p className="text-xs text-slate-400 pb-2">Receita = Hotmart (BRL); despesas = cartão + contas a pagar, por categoria.</p>
        </div>
      </Card>

      {naoClassificado > 0 && (
        <div className="flex items-start gap-2 mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>{fmtBRL(naoClassificado)}</strong> em despesas sem grupo de DRE (categoria não classificada ou em branco).
            Classifique as categorias na tela <strong>Categorias</strong> para refinar o resultado.
          </span>
        </div>
      )}

      {!temDados ? (
        <Card><Vazio mensagem="Sem dados para o período selecionado." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {cascata.map((l, i) => {
                if (l.kind === 'subtotal') {
                  return (
                    <tr key={i} className="border-t-2 border-slate-200 bg-slate-50">
                      <td className="px-5 py-2.5 font-bold text-slate-800">{l.rotulo}</td>
                      <td className={`px-5 py-2.5 text-right font-bold tabular-nums ${l.valor < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmtBRL(l.valor)}</td>
                    </tr>
                  )
                }
                const linhasDet = detalhe[l.bloco] ?? []
                const aberto = abertos.has(l.bloco)
                return (
                  <Fragment key={i}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => linhasDet.length && toggle(l.bloco)}>
                      <td className="px-5 py-2.5 text-slate-700">
                        <span className="inline-flex items-center gap-1.5">
                          {linhasDet.length > 0 && <ChevronRight size={14} className={`text-slate-400 transition-transform ${aberto ? 'rotate-90' : ''}`} />}
                          {l.rotulo}
                          <span className="text-xs text-slate-300">{linhasDet.length ? `(${linhasDet.length})` : ''}</span>
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{fmtBRL(l.valor)}</td>
                    </tr>
                    {aberto && linhasDet.map((d, j) => (
                      <tr key={`${i}-${j}`} className="bg-slate-50/40 text-xs">
                        <td className="pl-12 pr-5 py-1.5 text-slate-500 truncate">{d.categoria}</td>
                        <td className="px-5 py-1.5 text-right tabular-nums text-slate-500">{fmtBRL(Number(d.valor))}</td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
