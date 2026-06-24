import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { Card, PageHeader, ErroBanner, inputCls } from '../components/ui'
import { fmtBRL } from '../lib/format'

interface DreCashRow {
  month_num: number
  month_label: string
  dre_receivable: number
  dre_payable: number
  cash_receivable: number
  cash_payable: number
  dre_net: number
  cash_net: number
  difference: number
}

function diffColor(value: number): string {
  if (value > 0) return 'text-green-600'
  if (value < 0) return 'text-red-600'
  return 'text-gray-500'
}

export default function ConciliacaoDRE() {
  const { empresaAtiva } = useApp()
  const [ano, setAno] = useState<number>(new Date().getFullYear())
  const [rows, setRows] = useState<DreCashRow[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!empresaAtiva) return
    setLoading(true)
    setErro(null)
    const { data, error } = await supabase.rpc('dre_cash_reconciliation', {
      p_company_id: empresaAtiva.id,
      p_year: ano,
    })
    setLoading(false)
    if (error) {
      setErro(error.message)
      return
    }
    setRows((data as DreCashRow[]) ?? [])
  }, [empresaAtiva, ano])

  useEffect(() => {
    carregar()
  }, [carregar])

  const totais: Omit<DreCashRow, 'month_num' | 'month_label'> = rows.reduce(
    (acc, r) => ({
      dre_receivable: acc.dre_receivable + r.dre_receivable,
      dre_payable: acc.dre_payable + r.dre_payable,
      cash_receivable: acc.cash_receivable + r.cash_receivable,
      cash_payable: acc.cash_payable + r.cash_payable,
      dre_net: acc.dre_net + r.dre_net,
      cash_net: acc.cash_net + r.cash_net,
      difference: acc.difference + r.difference,
    }),
    {
      dre_receivable: 0,
      dre_payable: 0,
      cash_receivable: 0,
      cash_payable: 0,
      dre_net: 0,
      cash_net: 0,
      difference: 0,
    },
  )

  const anos = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i)

  return (
    <div className="space-y-6">
      <PageHeader titulo="Conciliação DRE × Caixa" />

      {erro && <ErroBanner mensagem={erro} />}

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-700">Ano</label>
          <select
            className={inputCls + ' w-32'}
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">Carregando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="py-2 px-3 text-left">Mês</th>
                  <th className="py-2 px-3 text-right">DRE Receitas</th>
                  <th className="py-2 px-3 text-right">DRE Despesas</th>
                  <th className="py-2 px-3 text-right">Resultado DRE</th>
                  <th className="py-2 px-3 text-right">Caixa Receitas</th>
                  <th className="py-2 px-3 text-right">Caixa Despesas</th>
                  <th className="py-2 px-3 text-right">Resultado Caixa</th>
                  <th className="py-2 px-3 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400 text-sm">
                      Nenhum dado encontrado para {ano}.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.month_num} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-3 font-medium text-gray-700">{r.month_label}</td>
                      <td className="py-2 px-3 text-right text-green-700">{fmtBRL(r.dre_receivable)}</td>
                      <td className="py-2 px-3 text-right text-red-600">{fmtBRL(r.dre_payable)}</td>
                      <td className={`py-2 px-3 text-right font-medium ${diffColor(r.dre_net)}`}>
                        {fmtBRL(r.dre_net)}
                      </td>
                      <td className="py-2 px-3 text-right text-green-700">{fmtBRL(r.cash_receivable)}</td>
                      <td className="py-2 px-3 text-right text-red-600">{fmtBRL(r.cash_payable)}</td>
                      <td className={`py-2 px-3 text-right font-medium ${diffColor(r.cash_net)}`}>
                        {fmtBRL(r.cash_net)}
                      </td>
                      <td className={`py-2 px-3 text-right font-semibold ${diffColor(r.difference)}`}>
                        {fmtBRL(r.difference)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className="py-2 px-3 text-gray-700">Total</td>
                    <td className="py-2 px-3 text-right text-green-700">{fmtBRL(totais.dre_receivable)}</td>
                    <td className="py-2 px-3 text-right text-red-600">{fmtBRL(totais.dre_payable)}</td>
                    <td className={`py-2 px-3 text-right ${diffColor(totais.dre_net)}`}>
                      {fmtBRL(totais.dre_net)}
                    </td>
                    <td className="py-2 px-3 text-right text-green-700">{fmtBRL(totais.cash_receivable)}</td>
                    <td className="py-2 px-3 text-right text-red-600">{fmtBRL(totais.cash_payable)}</td>
                    <td className={`py-2 px-3 text-right ${diffColor(totais.cash_net)}`}>
                      {fmtBRL(totais.cash_net)}
                    </td>
                    <td className={`py-2 px-3 text-right ${diffColor(totais.difference)}`}>
                      {fmtBRL(totais.difference)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex gap-3">
          <div className="mt-0.5 text-blue-500 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Nota explicativa</p>
            <p className="text-sm text-gray-600">
              A diferença entre DRE (competência) e Caixa é esperada e não indica erro. Representa
              receitas/despesas reconhecidas por competência mas ainda não movimentadas financeiramente.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
