import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL } from '../lib/format'
import { Card, PageHeader, ErroBanner, Vazio, inputCls } from '../components/ui'

// DRE gerencial por margem de contribuição — consome a RPC dre_by_competency
// que devolve linhas do plano de contas com valores por mês (m1…m12).
// Subtotais são calculados no cliente a partir das linhas is_analytical.

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

type DreRow = {
  account_code: string
  account_name: string
  parent_code: string | null
  nature: 'revenue' | 'deduction' | 'variable_cost' | 'fixed_cost' | 'financial' | 'depreciation' | 'tax'
  is_analytical: boolean
  sort_order: number
  m1: number; m2: number; m3: number; m4: number; m5: number; m6: number
  m7: number; m8: number; m9: number; m10: number; m11: number; m12: number
  total: number
}

type MV = { months: number[]; total: number }

type DreItem =
  | { type: 'section'; nature: DreRow['nature']; label: string; mv: MV }
  | { type: 'subtotal'; label: string; mv: MV }

function mVal(row: DreRow, m: number): number {
  const v = row[`m${m}` as keyof DreRow]
  return typeof v === 'number' ? v : Number(v ?? 0)
}

function mvSub(a: MV, b: MV): MV {
  return {
    months: a.months.map((v, i) => v - b.months[i]),
    total: a.total - b.total,
  }
}

function valCls(v: number): string {
  if (v > 0) return 'text-emerald-600'
  if (v < 0) return 'text-red-600'
  return 'text-slate-400'
}

export default function DRE() {
  const { empresaAtiva } = useApp()
  const anoAtual = new Date().getFullYear()
  const [ano, setAno] = useState(anoAtual)
  const [mesDe, setMesDe] = useState(1)
  const [mesAte, setMesAte] = useState(12)
  const [dados, setDados] = useState<DreRow[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  const carregar = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase.rpc('dre_by_competency', {
      p_company_id: empresaAtiva.id,
      p_year: ano,
    })
    setCarregando(false)
    if (error) {
      setErro('Erro ao carregar a DRE: ' + error.message)
      setDados([])
      return
    }
    setDados((data as DreRow[] | null) ?? [])
  }, [empresaAtiva, ano])

  useEffect(() => { carregar() }, [carregar])

  // Meses selecionados (1-12), sempre em ordem crescente
  const meses = useMemo<number[]>(() => {
    const s = Math.min(mesDe, mesAte)
    const e = Math.max(mesDe, mesAte)
    return Array.from({ length: e - s + 1 }, (_, i) => s + i)
  }, [mesDe, mesAte])

  // Índice por natureza, ordenado por sort_order
  const byNature = useMemo<Partial<Record<DreRow['nature'], DreRow[]>>>(() => {
    const map: Partial<Record<DreRow['nature'], DreRow[]>> = {}
    for (const r of dados) {
      ;(map[r.nature] ??= []).push(r)
    }
    for (const k in map) {
      map[k as DreRow['nature']]!.sort((a, b) => a.sort_order - b.sort_order)
    }
    return map
  }, [dados])

  // Subtotais calculados no cliente, apenas linhas is_analytical
  const calc = useMemo(() => {
    const mv = (nature: DreRow['nature']): MV => {
      const rows = (byNature[nature] ?? []).filter(r => r.is_analytical)
      const months = meses.map(m => rows.reduce((s, r) => s + mVal(r, m), 0))
      return { months, total: months.reduce((s, v) => s + v, 0) }
    }

    const receitaBruta = mv('revenue')
    const deducoes     = mv('deduction')
    const receitaLiq   = mvSub(receitaBruta, deducoes)
    const custoVar     = mv('variable_cost')
    const mc           = mvSub(receitaLiq, custoVar)
    const despFixa     = mv('fixed_cost')
    const ebitda       = mvSub(mc, despFixa)
    const financeiro   = mv('financial')
    const depreciacao  = mv('depreciation')
    const lair         = mvSub(mvSub(ebitda, financeiro), depreciacao)
    const impostos     = mv('tax')
    const lucroLiq     = mvSub(lair, impostos)

    return {
      receitaBruta, deducoes, receitaLiq,
      custoVar, mc, despFixa, ebitda,
      financeiro, depreciacao, lair,
      impostos, lucroLiq,
    }
  }, [byNature, meses])

  // Estrutura da DRE — ordem, rótulos e valores pré-calculados
  const items = useMemo<DreItem[]>(() => [
    { type: 'section',  nature: 'revenue',       label: 'Receita Bruta',               mv: calc.receitaBruta },
    { type: 'section',  nature: 'deduction',      label: '(−) Deduções',                mv: calc.deducoes     },
    { type: 'subtotal',                            label: '(=) Receita Líquida',         mv: calc.receitaLiq   },
    { type: 'section',  nature: 'variable_cost',  label: '(−) Custos Variáveis',        mv: calc.custoVar     },
    { type: 'subtotal',                            label: '(=) Margem de Contribuição',  mv: calc.mc           },
    { type: 'section',  nature: 'fixed_cost',     label: '(−) Despesas Fixas',          mv: calc.despFixa     },
    { type: 'subtotal',                            label: '(=) EBITDA',                  mv: calc.ebitda       },
    { type: 'section',  nature: 'financial',      label: '(−) Despesas Financeiras',    mv: calc.financeiro   },
    { type: 'section',  nature: 'depreciation',   label: '(−) Depreciação',             mv: calc.depreciacao  },
    { type: 'subtotal',                            label: '(=) LAIR',                    mv: calc.lair         },
    { type: 'section',  nature: 'tax',            label: '(−) IRPJ/CSLL',              mv: calc.impostos     },
    { type: 'subtotal',                            label: '(=) Lucro Líquido',           mv: calc.lucroLiq     },
  ], [calc])

  const toggle = (nature: string) => {
    setExpandidos(prev => {
      const n = new Set(prev)
      if (n.has(nature)) n.delete(nature); else n.add(nature)
      return n
    })
  }

  const rowMV = useCallback((row: DreRow): MV => {
    const months = meses.map(m => mVal(row, m))
    return { months, total: months.reduce((s, v) => s + v, 0) }
  }, [meses])

  const temDados = dados.length > 0
  const anos = Array.from({ length: anoAtual - 2019 + 2 }, (_, i) => 2020 + i)

  return (
    <div>
      <PageHeader
        titulo="DRE"
        subtitulo="Demonstração do resultado por margem de contribuição (competência)"
      />

      <ErroBanner mensagem={erro} />

      {/* Filtros */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ano</label>
            <select
              className={inputCls}
              value={ano}
              onChange={e => setAno(Number(e.target.value))}
            >
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
            <select
              className={inputCls}
              value={mesDe}
              onChange={e => setMesDe(Number(e.target.value))}
            >
              {MESES.map((nome, i) => (
                <option key={i + 1} value={i + 1}>{nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
            <select
              className={inputCls}
              value={mesAte}
              onChange={e => setMesAte(Number(e.target.value))}
            >
              {MESES.map((nome, i) => (
                <option key={i + 1} value={i + 1}>{nome}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Loading */}
      {carregando && (
        <Card className="p-6 flex justify-center">
          <span className="text-sm text-slate-400">Carregando DRE…</span>
        </Card>
      )}

      {/* Sem dados */}
      {!carregando && !temDados && (
        <Card>
          <Vazio mensagem={
            !empresaAtiva?.id
              ? 'Selecione uma empresa para visualizar a DRE.'
              : 'Sem dados para o período selecionado.'
          } />
        </Card>
      )}

      {/* Tabela */}
      {!carregando && temDados && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[220px]">
                    Conta
                  </th>
                  {meses.map(m => (
                    <th
                      key={m}
                      className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[90px]"
                    >
                      {MESES[m - 1]}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[110px] border-l border-slate-200">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  /* ---------- linha de subtotal ---------- */
                  if (item.type === 'subtotal') {
                    const isLucro = item.label.includes('Lucro')
                    return (
                      <tr
                        key={i}
                        className={`border-t-2 border-slate-300 ${isLucro ? 'bg-slate-100' : 'bg-slate-50'}`}
                      >
                        <td className="px-4 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                          {item.label}
                        </td>
                        {item.mv.months.map((v, mi) => (
                          <td
                            key={mi}
                            className={`px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${valCls(v)}`}
                          >
                            {fmtBRL(v)}
                          </td>
                        ))}
                        <td
                          className={`px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap border-l border-slate-200 ${valCls(item.mv.total)}`}
                        >
                          {fmtBRL(item.mv.total)}
                        </td>
                      </tr>
                    )
                  }

                  /* ---------- linha de seção (bloco) ---------- */
                  const rows   = byNature[item.nature] ?? []
                  const isOpen = expandidos.has(item.nature)
                  const hasRows = rows.length > 0

                  return (
                    <Fragment key={i}>
                      <tr
                        className={`border-b border-slate-100 font-semibold ${hasRows ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                        onClick={() => hasRows && toggle(item.nature)}
                      >
                        <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {hasRows && (
                              <ChevronRight
                                size={14}
                                className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                              />
                            )}
                            {item.label}
                            {hasRows && (
                              <span className="text-xs font-normal text-slate-400">
                                ({rows.length})
                              </span>
                            )}
                          </span>
                        </td>
                        {item.mv.months.map((v, mi) => (
                          <td
                            key={mi}
                            className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${valCls(v)}`}
                          >
                            {fmtBRL(v)}
                          </td>
                        ))}
                        <td
                          className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap border-l border-slate-200 ${valCls(item.mv.total)}`}
                        >
                          {fmtBRL(item.mv.total)}
                        </td>
                      </tr>

                      {/* linhas analíticas (expandidas) */}
                      {isOpen && rows.map((r, ri) => {
                        const rv = rowMV(r)
                        return (
                          <tr
                            key={ri}
                            className={`border-b border-slate-50 text-xs ${r.is_analytical ? 'bg-white' : 'bg-slate-50/40'}`}
                          >
                            <td
                              className={`py-1.5 pr-4 text-slate-600 truncate max-w-xs ${r.is_analytical ? 'pl-10' : 'pl-7 font-medium'}`}
                              title={r.account_name}
                            >
                              {r.account_name}
                            </td>
                            {rv.months.map((v, mi) => (
                              <td
                                key={mi}
                                className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${v !== 0 ? valCls(v) : 'text-slate-300'}`}
                              >
                                {v !== 0 ? fmtBRL(v) : '—'}
                              </td>
                            ))}
                            <td
                              className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-l border-slate-100 ${rv.total !== 0 ? valCls(rv.total) : 'text-slate-300'}`}
                            >
                              {rv.total !== 0 ? fmtBRL(rv.total) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
