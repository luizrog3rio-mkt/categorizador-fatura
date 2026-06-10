import { useCallback, useEffect, useMemo, useState } from 'react'
import { Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { parseHotmartCSV, vendaAprovada } from '../lib/hotmart'
import { fmtBRL, fmtData, primeiroDiaMes, ultimoDiaMes } from '../lib/format'
import type { HotmartSale } from '../lib/types'
import { Card, PageHeader, Vazio, ErroBanner, inputCls, btnPrimario } from '../components/ui'

// Etapa 6 — Conciliação Hotmart. Port do Hotmart.tsx do rb7 pra hotmart_sales.
// Feature 100% exclusiva do rb7 (não existia no app antigo). Upsert por
// transaction_code com MERGE (reimport atualiza status: reembolso/chargeback
// refletem). status mantém valores PT dos relatórios Hotmart.
export default function Hotmart() {
  const { empresas, empresaAtiva } = useApp()
  const [vendas, setVendas] = useState<HotmartSale[]>([])
  const [empresaDestino, setEmpresaDestino] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [mesFiltro, setMesFiltro] = useState('') // YYYY-MM

  useEffect(() => {
    if (empresas.length && !empresaDestino) setEmpresaDestino(empresaAtiva?.id ?? empresas[0].id)
  }, [empresas, empresaAtiva, empresaDestino])

  const carregar = useCallback(async () => {
    let q = supabase.from('hotmart_sales').select('*').order('sale_date', { ascending: false }).limit(500)
    if (empresaAtiva) q = q.eq('company_id', empresaAtiva.id)
    if (mesFiltro) {
      const [y, m] = mesFiltro.split('-').map(Number)
      const base = new Date(y, m - 1, 1)
      q = q.gte('sale_date', primeiroDiaMes(base)).lte('sale_date', ultimoDiaMes(base))
    }
    const { data, error } = await q
    if (error) { setErro('Erro ao carregar vendas: ' + error.message); return }
    setVendas((data as HotmartSale[]) ?? [])
  }, [empresaAtiva, mesFiltro])

  useEffect(() => { carregar() }, [carregar])

  const importar = async (file: File) => {
    if (!empresaDestino) { setMsg('Selecione a empresa de destino.'); return }
    setImportando(true)
    setMsg(null)
    setErro(null)
    const texto = await file.text()
    const { vendas: parsed, erros } = parseHotmartCSV(texto)
    if (parsed.length === 0) {
      setMsg('Nenhuma venda válida no arquivo. ' + erros.slice(0, 3).join(' '))
      setImportando(false)
      return
    }
    // dedupe no lote (última ocorrência vence): com merge, código repetido no
    // mesmo arquivo derrubaria o upsert inteiro (erro 21000 do Postgres)
    const porCodigo = new Map(parsed.map((v) => [v.transaction_code, v]))
    const linhas = [...porCodigo.values()].map((v) => ({ ...v, company_id: empresaDestino }))
    const { error, data } = await supabase
      .from('hotmart_sales')
      .upsert(linhas, { onConflict: 'transaction_code' })
      .select('id')
    if (error) setMsg(`Erro: ${error.message}`)
    else
      setMsg(
        `${parsed.length} vendas no arquivo · ${data?.length ?? 0} importadas/atualizadas.` +
          (erros.length ? ` Avisos: ${erros.slice(0, 3).join(' ')}` : '')
      )
    setImportando(false)
    carregar()
  }

  const totais = useMemo(() => {
    const aprovadas = vendas.filter((v) => vendaAprovada(v.status))
    return {
      qtd: aprovadas.length,
      bruto: aprovadas.reduce((s, v) => s + Number(v.gross_amount), 0),
      taxas: aprovadas.reduce((s, v) => s + Number(v.hotmart_fee), 0),
      afiliados: aprovadas.reduce((s, v) => s + Number(v.affiliate_commission) + Number(v.coproduction_commission), 0),
      liquido: aprovadas.reduce((s, v) => s + Number(v.net_amount), 0),
    }
  }, [vendas])

  return (
    <div>
      <PageHeader
        titulo="Conciliação Hotmart"
        subtitulo="Bruto vs líquido · taxas por venda · afiliados e coprodução"
      />

      <ErroBanner mensagem={erro} />

      <Card className="p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          {empresas.length > 1 && (
            <div className="min-w-48">
              <label className="block text-sm font-medium mb-1">Empresa de destino</label>
              <select className={inputCls} value={empresaDestino} onChange={(e) => setEmpresaDestino(e.target.value)}>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          <label className={btnPrimario + ' cursor-pointer'}>
            <Upload size={16} />
            {importando ? 'Importando…' : 'Importar CSV da Hotmart'}
            <input
              type="file"
              accept=".csv,.CSV,.txt"
              className="hidden"
              disabled={importando}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }}
            />
          </label>
          <div className="ml-auto">
            <label className="block text-sm font-medium mb-1">Mês</label>
            <input type="month" className={inputCls} value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} />
          </div>
        </div>
        {msg && <p className="text-sm text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mt-4">{msg}</p>}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Vendas</p>
          <p className="text-xl font-bold mt-1">{totais.qtd}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Bruto</p>
          <p className="text-xl font-bold mt-1">{fmtBRL(totais.bruto)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Taxas Hotmart</p>
          <p className="text-xl font-bold text-red-600 mt-1">{fmtBRL(totais.taxas)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Afiliados/Coprod.</p>
          <p className="text-xl font-bold text-orange-600 mt-1">{fmtBRL(totais.afiliados)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Líquido</p>
          <p className="text-xl font-bold text-green-600 mt-1">{fmtBRL(totais.liquido)}</p>
        </Card>
      </div>

      <Card>
        {vendas.length === 0 ? (
          <Vazio mensagem="Nenhuma venda importada. Exporte o relatório de vendas da Hotmart em CSV e importe acima." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Transação</th>
                  <th className="px-4 py-3 text-right">Bruto</th>
                  <th className="px-4 py-3 text-right">Taxa</th>
                  <th className="px-4 py-3 text-right">Afil./Coprod.</th>
                  <th className="px-4 py-3 text-right">Líquido</th>
                  <th className="px-4 py-3">Liberação</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{fmtData(v.sale_date)}</td>
                    <td className="px-4 py-2.5 text-slate-800">{v.product}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{v.transaction_code}</td>
                    <td className="px-4 py-2.5 text-right">{fmtBRL(Number(v.gross_amount))}</td>
                    <td className="px-4 py-2.5 text-right text-red-600">{fmtBRL(Number(v.hotmart_fee))}</td>
                    <td className="px-4 py-2.5 text-right text-orange-600">
                      {fmtBRL(Number(v.affiliate_commission) + Number(v.coproduction_commission))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-700">{fmtBRL(Number(v.net_amount))}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{fmtData(v.release_date)}</td>
                    <td className="px-4 py-2.5 text-xs">{v.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
