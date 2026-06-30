import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL } from '../lib/format'
import { exportTabelaCSV, exportTabelaXLSX } from '../lib/exportTabela'
import { Card, PageHeader, ErroBanner, Vazio, KPICard, KPIStrip, Button, Alert, inputCls } from '../components/ui'

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
  if (v > 0) return 'text-revenue'
  if (v < 0) return 'text-expense'
  return 'text-fg-subtle'
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
  // lançamentos sem Plano de Contas — somem da DRE (o JOIN os engole). Mostramos um alerta.
  const [naoClass, setNaoClass] = useState<{ qtd: number; valor: number; qtdTx: number; valorTx: number } | null>(null)

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

    // lançamentos da empresa SEM conta do plano (invisíveis na DRE) — entries E cartão, via RPC
    // server-side (evita o teto de 1000; o cartão entra na DRE por transactions.chart_of_account_id,
    // então o cartão órfão também some — o Alert antes só contava entries).
    const { data: nc } = await supabase.rpc('dre_nao_classificado', { p_company: empresaAtiva.id })
    const r = (nc as { qtd_entries: number; valor_entries: number; qtd_tx: number; valor_tx: number }[] | null)?.[0]
    const qtdTx = Number(r?.qtd_tx ?? 0)
    const valorTx = Number(r?.valor_tx ?? 0)
    const qtd = Number(r?.qtd_entries ?? 0) + qtdTx
    const valor = Number(r?.valor_entries ?? 0) + valorTx
    setNaoClass(qtd > 0 ? { qtd, valor, qtdTx, valorTx } : null)
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

  // Análise vertical: cada linha como % da Receita Bruta (= 100%) no período.
  const baseAV = calc.receitaBruta.total
  const avTexto = (total: number) => baseAV !== 0 ? (total / baseAV * 100).toFixed(1).replace('.', ',') + '%' : '—'

  const exportar = (formato: 'xlsx' | 'csv') => {
    const header = ['Conta', ...meses.map((m) => MESES[m - 1]), 'Total', '% AV']
    const linhas: (string | number)[][] = []
    for (const item of items) {
      linhas.push([item.label, ...item.mv.months, item.mv.total, avTexto(item.mv.total)])
      if (item.type === 'section') {
        for (const r of (byNature[item.nature] ?? [])) {
          const rv = rowMV(r)
          linhas.push(['   ' + r.account_name, ...rv.months, rv.total, avTexto(rv.total)])
        }
      }
    }
    const nome = `DRE_${(empresaAtiva?.name ?? 'empresa').replace(/\s+/g, '-')}_${ano}_${MESES[meses[0] - 1]}-${MESES[meses[meses.length - 1] - 1]}`
    if (formato === 'xlsx') exportTabelaXLSX(header, linhas, nome, 'DRE').catch(console.error)
    else exportTabelaCSV(header, linhas, nome)
  }

  return (
    <div>
      <PageHeader
        titulo="DRE"
        subtitulo="Resultado por margem de contribuição · regime de COMPETÊNCIA (data da venda/competência) · inclui Hotmart + cartão, classificado por conta do Plano"
        acao={temDados ? (
          <div className="flex gap-2">
            <Button variante="secondary" onClick={() => exportar('xlsx')}><Download size={16} /> Excel</Button>
            <Button variante="ghost" onClick={() => exportar('csv')}>CSV</Button>
          </div>
        ) : undefined}
      />

      <ErroBanner mensagem={erro} />

      {/* Filtros */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1">Ano</label>
            <select
              className={inputCls}
              value={ano}
              onChange={e => setAno(Number(e.target.value))}
            >
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1">De</label>
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
            <label className="block text-xs font-medium text-fg-muted mb-1">Até</label>
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
          <span className="text-sm text-fg-subtle">Carregando DRE…</span>
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

      {/* Resumo escaneável (período selecionado) */}
      {!carregando && temDados && (
        <div className="mb-4">
          <KPIStrip cols={4}>
            <KPICard label="Receita Líquida" valor={fmtBRL(calc.receitaLiq.total)} tom="revenue" />
            <KPICard label="Margem de Contribuição" valor={fmtBRL(calc.mc.total)} tom={calc.mc.total >= 0 ? 'revenue' : 'expense'} />
            <KPICard label="EBITDA" valor={fmtBRL(calc.ebitda.total)} tom={calc.ebitda.total >= 0 ? 'revenue' : 'expense'} />
            <KPICard label="Lucro Líquido" valor={fmtBRL(calc.lucroLiq.total)} tom={calc.lucroLiq.total >= 0 ? 'revenue' : 'expense'} />
          </KPIStrip>
        </div>
      )}

      {/* Alerta: lançamentos sem Plano de Contas somem da DRE (o JOIN os engole em silêncio) */}
      {!carregando && naoClass && (
        <div className="mb-4">
          <Alert tom="warning" titulo="Lançamentos fora desta DRE">
            <strong className="tnum">{naoClass.qtd}</strong> lançamento(s) desta empresa, somando{' '}
            <strong className="tnum">{fmtBRL(naoClass.valor)}</strong>, estão <strong>sem Plano de Contas</strong> e
            não entram na DRE.
            {naoClass.qtdTx > 0 && (
              <> Destes, <strong className="tnum">{naoClass.qtdTx}</strong> são de <strong>cartão</strong>{' '}
              (<strong className="tnum">{fmtBRL(naoClass.valorTx)}</strong>) — classifique na aba Lançamentos da Fatura.</>
            )}
            {' '}Os demais, em Contas a Pagar/Receber (campo "Conta do Plano de Contas").
          </Alert>
        </div>
      )}

      {/* Tabela */}
      {!carregando && temDados && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-surface-2">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-fg-muted uppercase tracking-wide min-w-[220px]">
                    Conta
                  </th>
                  {meses.map(m => (
                    <th
                      key={m}
                      className="px-3 py-3 text-right text-xs font-semibold text-fg-muted uppercase tracking-wide min-w-[90px]"
                    >
                      {MESES[m - 1]}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right text-xs font-semibold text-fg-muted uppercase tracking-wide min-w-[110px] border-l border-border">
                    Total
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-fg-muted uppercase tracking-wide min-w-[64px]" title="Análise vertical — % sobre a Receita Bruta">
                    % AV
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
                        className={`border-t-2 border-border-strong ${isLucro ? 'bg-canvas' : 'bg-surface-2'}`}
                      >
                        <td className="px-4 py-2.5 font-bold text-fg whitespace-nowrap">
                          {item.label}
                        </td>
                        {item.mv.months.map((v, mi) => (
                          <td
                            key={mi}
                            className={`px-3 py-2.5 text-right font-bold tnum whitespace-nowrap ${valCls(v)}`}
                          >
                            {fmtBRL(v)}
                          </td>
                        ))}
                        <td
                          className={`px-3 py-2.5 text-right font-bold tnum whitespace-nowrap border-l border-border ${valCls(item.mv.total)}`}
                        >
                          {fmtBRL(item.mv.total)}
                        </td>
                        <td className="px-3 py-2.5 text-right tnum text-xs font-semibold text-fg-subtle whitespace-nowrap">
                          {avTexto(item.mv.total)}
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
                        className={`border-b border-border font-semibold ${hasRows ? 'cursor-pointer hover:bg-surface-2' : ''}`}
                        onClick={() => hasRows && toggle(item.nature)}
                      >
                        <td className="px-4 py-2.5 text-fg-muted whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {hasRows && (
                              <ChevronRight
                                size={14}
                                className={`text-fg-subtle transition-transform ${isOpen ? 'rotate-90' : ''}`}
                              />
                            )}
                            {item.label}
                            {hasRows && (
                              <span className="text-xs font-normal text-fg-subtle">
                                ({rows.length})
                              </span>
                            )}
                          </span>
                        </td>
                        {item.mv.months.map((v, mi) => (
                          <td
                            key={mi}
                            className={`px-3 py-2.5 text-right tnum whitespace-nowrap ${valCls(v)}`}
                          >
                            {fmtBRL(v)}
                          </td>
                        ))}
                        <td
                          className={`px-3 py-2.5 text-right tnum whitespace-nowrap border-l border-border ${valCls(item.mv.total)}`}
                        >
                          {fmtBRL(item.mv.total)}
                        </td>
                        <td className="px-3 py-2.5 text-right tnum text-xs text-fg-subtle whitespace-nowrap">
                          {avTexto(item.mv.total)}
                        </td>
                      </tr>

                      {/* linhas analíticas (expandidas) */}
                      {isOpen && rows.map((r, ri) => {
                        const rv = rowMV(r)
                        return (
                          <tr
                            key={ri}
                            className={`border-b border-border text-xs ${r.is_analytical ? 'bg-surface' : 'bg-surface-2/40'}`}
                          >
                            <td
                              className={`py-1.5 pr-4 text-fg-muted truncate max-w-xs ${r.is_analytical ? 'pl-10' : 'pl-7 font-medium'}`}
                              title={r.account_name}
                            >
                              {r.account_name}
                            </td>
                            {rv.months.map((v, mi) => (
                              <td
                                key={mi}
                                className={`px-3 py-1.5 text-right tnum whitespace-nowrap ${v !== 0 ? valCls(v) : 'text-fg-subtle'}`}
                              >
                                {v !== 0 ? fmtBRL(v) : '—'}
                              </td>
                            ))}
                            <td
                              className={`px-3 py-1.5 text-right tnum whitespace-nowrap border-l border-border ${rv.total !== 0 ? valCls(rv.total) : 'text-fg-subtle'}`}
                            >
                              {rv.total !== 0 ? fmtBRL(rv.total) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right tnum text-xs text-fg-subtle whitespace-nowrap">
                              {rv.total !== 0 ? avTexto(rv.total) : '—'}
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
