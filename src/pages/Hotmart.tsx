import { useCallback, useEffect, useMemo, useState } from 'react'
import { Upload, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { parseHotmartCSV } from '../lib/hotmart'
import { fmtBRL, fmtData } from '../lib/format'
import type { HotmartSale } from '../lib/types'
import { Card, PageHeader, Vazio, ErroBanner, inputCls, btnPrimario, btnSecundario } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'
import DateRangePicker from '../components/DateRangePicker'

// Etapa 6 — Conciliação Hotmart. Port do Hotmart.tsx do rb7 pra hotmart_sales.
// Feature 100% exclusiva do rb7 (não existia no app antigo). Upsert por
// transaction_code com MERGE (reimport atualiza status: reembolso/chargeback
// refletem). status mantém valores PT dos relatórios Hotmart.
// Status vem da API em inglês maiúsculo (COMPLETE/APPROVED/REFUNDED/...) e do
// CSV em PT — bucketiza por regex cobrindo os dois idiomas. Rótulo PT amigável.
function classeStatus(s: string): string {
  if (/complet|approv|aprovad|conclu/i.test(s)) return 'bg-green-100 text-green-700'
  if (/refund|reembols|estorn/i.test(s)) return 'bg-amber-100 text-amber-700'
  if (/chargeback/i.test(s)) return 'bg-red-100 text-red-700'
  if (/cancel/i.test(s)) return 'bg-red-100 text-red-700'
  if (/expir|atras|overdue|waiting|billet|printed|pending/i.test(s)) return 'bg-orange-100 text-orange-700'
  return 'bg-slate-100 text-slate-600'
}

function rotuloStatus(s: string): string {
  if (/complet|conclu/i.test(s)) return 'Concluída'
  if (/approv|aprovad/i.test(s)) return 'Aprovada'
  if (/refund|reembols|estorn/i.test(s)) return 'Reembolsada'
  if (/chargeback/i.test(s)) return 'Chargeback'
  if (/cancel/i.test(s)) return 'Cancelada'
  if (/expir/i.test(s)) return 'Expirada'
  return s
}

function StatusHotmart({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${classeStatus(status)}`}>
      {rotuloStatus(status)}
    </span>
  )
}

export default function Hotmart() {
  const { empresas, empresaAtiva, isAdmin } = useApp()
  const [vendas, setVendas] = useState<HotmartSale[]>([])
  const [empresaDestino, setEmpresaDestino] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [totais, setTotais] = useState({ qtd: 0, total: 0, bruto: 0, taxas: 0, afiliados: 0, liquido: 0, foraMoeda: 0 })

  useEffect(() => {
    if (empresas.length && !empresaDestino) setEmpresaDestino(empresaAtiva?.id ?? empresas[0].id)
  }, [empresas, empresaAtiva, empresaDestino])

  const carregar = useCallback(async () => {
    setErro(null)
    const pStart: string | null = dataDe || null
    const pEnd: string | null = dataAte || null
    // tabela: 300 vendas mais recentes (o PostgREST limita a 1000 mesmo)
    let q = supabase.from('hotmart_sales').select('*').order('sale_date', { ascending: false }).limit(300)
    if (empresaAtiva) q = q.eq('company_id', empresaAtiva.id)
    if (pStart) q = q.gte('sale_date', pStart)
    if (pEnd) q = q.lte('sale_date', pEnd)
    const { data, error } = await q
    if (error) { setErro('Erro ao carregar vendas: ' + error.message); return }
    setVendas((data as HotmartSale[]) ?? [])

    // KPIs: agregados no banco (corretos a qualquer volume)
    const { data: tot, error: e2 } = await supabase.rpc('hotmart_totals', {
      p_company: empresaAtiva?.id ?? null,
      p_start: pStart,
      p_end: pEnd,
    })
    if (e2) { setErro('Erro nos totais: ' + e2.message); return }
    const t = tot?.[0]
    setTotais(t
      ? { qtd: Number(t.qtd), total: Number(t.total), bruto: Number(t.bruto), taxas: Number(t.taxas), afiliados: Number(t.afiliados), liquido: Number(t.liquido), foraMoeda: Number(t.fora_moeda) }
      : { qtd: 0, total: 0, bruto: 0, taxas: 0, afiliados: 0, liquido: 0, foraMoeda: 0 })
  }, [empresaAtiva, dataDe, dataAte])

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

  // Sincronização direta via API (Edge Function hotmart-sync) — sem CSV.
  // Janela de ~2 meses por clique (produto de alto volume).
  const sincronizar = async () => {
    if (!empresaDestino) { setMsg('Selecione a empresa de destino.'); return }
    setSincronizando(true)
    setMsg(null)
    setErro(null)
    const { data, error } = await supabase.functions.invoke('hotmart-sync', {
      body: { company_id: empresaDestino, months: 2 },
    })
    setSincronizando(false)
    if (error) { setErro('Erro na sincronização: ' + error.message); return }
    if (data?.error) { setErro('Hotmart: ' + (data.detalhe || data.error)); return }
    setMsg(`Sincronizado · ${data.encontradas} vendas no período · ${data.gravadas} gravadas/atualizadas (${data.janela_meses} meses).`)
    carregar()
  }

  // colunas da tabela (reordenáveis/redimensionáveis/ocultáveis via DataTable)
  const colunas = useMemo<DataColumn<HotmartSale>[]>(() => [
    { id: 'sale_date', header: 'Data', size: 100, cell: (v) => <span className="whitespace-nowrap text-slate-600">{fmtData(v.sale_date)}</span> },
    { id: 'product', header: 'Produto', size: 220, cell: (v) => (
      <span className="text-slate-800">
        {v.product}
        {v.currency && v.currency !== 'BRL' && (
          <span className="ml-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 align-middle">{v.currency}</span>
        )}
      </span>
    ) },
    { id: 'transaction_code', header: 'Transação', size: 130, cell: (v) => <span className="text-xs text-slate-400">{v.transaction_code}</span> },
    { id: 'total_amount', header: 'Valor Total', size: 120, align: 'right', cell: (v) => fmtBRL(Number(v.total_amount)) },
    { id: 'gross_amount', header: 'Bruto', size: 110, align: 'right', cell: (v) => fmtBRL(Number(v.gross_amount)) },
    { id: 'hotmart_fee', header: 'Taxa', size: 100, align: 'right', cell: (v) => <span className="text-red-600">{fmtBRL(Number(v.hotmart_fee))}</span> },
    { id: 'fee_percentage', header: '% Hotmart', size: 100, align: 'right', cell: (v) => <span className="text-slate-500 whitespace-nowrap">{v.fee_percentage != null ? `${Number(v.fee_percentage)}%` : '—'}</span> },
    { id: 'afiliados', header: 'Afil./Coprod.', size: 120, align: 'right', cell: (v) => <span className="text-orange-600">{fmtBRL(Number(v.affiliate_commission) + Number(v.coproduction_commission))}</span> },
    { id: 'net_amount', header: 'Líquido', size: 120, align: 'right', cell: (v) => <span className="font-semibold text-green-700">{fmtBRL(Number(v.net_amount))}</span> },
    { id: 'release_date', header: 'Liberação', size: 110, cell: (v) => <span className="whitespace-nowrap text-slate-600">{fmtData(v.release_date)}</span> },
    { id: 'payment_method', header: 'Pagamento', size: 130, cell: (v) => <span className="text-xs text-slate-600 whitespace-nowrap">{v.payment_method ?? '—'}</span> },
    { id: 'installments', header: 'Parcelas', size: 90, align: 'center', cell: (v) => <span className="text-slate-600 whitespace-nowrap">{v.installments == null ? '—' : v.installments <= 1 ? 'À vista' : `${v.installments}x`}</span> },
    { id: 'status', header: 'Status', size: 120, cell: (v) => <StatusHotmart status={v.status} /> },
  ], [])

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
          <button onClick={sincronizar} disabled={sincronizando || !isAdmin} className={btnPrimario}>
            <RefreshCw size={16} className={sincronizando ? 'animate-spin' : ''} />
            {sincronizando ? 'Sincronizando…' : 'Sincronizar com a Hotmart'}
          </button>
          <label className={btnSecundario + (!isAdmin ? ' opacity-50 pointer-events-none' : ' cursor-pointer')} title="Importar um CSV exportado da Hotmart (alternativa à sincronização)">
            <Upload size={16} />
            {importando ? 'Importando…' : 'CSV'}
            <input
              type="file"
              accept=".csv,.CSV,.txt"
              className="hidden"
              disabled={importando}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }}
            />
          </label>
          <div className="ml-auto">
            <label className="block text-sm font-medium mb-1">Período</label>
            <DateRangePicker de={dataDe} ate={dataAte} onChange={(d, a) => { setDataDe(d); setDataAte(a) }} />
          </div>
        </div>
        {msg && <p className="text-sm text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mt-4">{msg}</p>}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-2">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Vendas</p>
          <p className="text-xl font-bold mt-1">{totais.qtd}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Valor Total</p>
          <p className="text-xl font-bold text-slate-700 mt-1">{fmtBRL(totais.total)}</p>
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
      <p className="text-xs text-slate-400 mb-6">
        Valor Total = pago pelos compradores (com juros de parcelamento) · Bruto = preço dos produtos (sem juros) · Líquido = bruto − taxas.
        {totais.foraMoeda > 0 && (
          <span className="text-amber-600"> · {totais.foraMoeda} venda{totais.foraMoeda !== 1 ? 's' : ''} em outra moeda não {totais.foraMoeda !== 1 ? 'incluídas' : 'incluída'} nos totais (R$).</span>
        )}
      </p>

      <Card>
        {vendas.length === 0 ? (
          <Vazio mensagem="Nenhuma venda ainda. Clique em Sincronizar com a Hotmart acima — ou importe um CSV exportado de lá." />
        ) : (
          <>
            <DataTable
              tableKey="hotmart-sales"
              columns={colunas}
              data={vendas.slice(0, 300)}
              getRowId={(v) => v.id}
            />
            {totais.qtd > vendas.length && (
              <p className="text-xs text-slate-400 text-center py-3 border-t border-slate-100">
                Mostrando as {vendas.length} vendas mais recentes. Os totais acima consideram todas as {totais.qtd} aprovadas do período. Use o filtro de período para ver outros intervalos.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
