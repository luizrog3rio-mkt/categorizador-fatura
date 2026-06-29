import { useCallback, useEffect, useMemo, useState } from 'react'
import { Upload, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { parseHotmartCSV } from '../lib/hotmart'
import { fmtBRL, fmtData } from '../lib/format'
import type { HotmartSale } from '../lib/types'
import { Card, PageHeader, Vazio, ErroBanner, KPICard, Alert, Badge, type BadgeTom, inputCls, btnPrimario, btnSecundario } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'
import DateRangePicker from '../components/DateRangePicker'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'

// Etapa 6 — Conciliação Hotmart. Port do Hotmart.tsx do rb7 pra hotmart_sales.
// Feature 100% exclusiva do rb7 (não existia no app antigo). Upsert por
// transaction_code com MERGE (reimport atualiza status: reembolso/chargeback
// refletem). status mantém valores PT dos relatórios Hotmart.
// Status vem da API em inglês maiúsculo (COMPLETE/APPROVED/REFUNDED/...) e do
// CSV em PT — bucketiza por regex cobrindo os dois idiomas. Rótulo PT amigável.
function tomStatus(s: string): BadgeTom {
  if (/complet|approv|aprovad|conclu/i.test(s)) return 'revenue'
  if (/refund|reembols|estorn/i.test(s)) return 'warning'
  if (/chargeback/i.test(s)) return 'expense'
  if (/cancel/i.test(s)) return 'expense'
  if (/expir|atras|overdue|waiting|billet|printed|pending/i.test(s)) return 'warning'
  return 'muted'
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
  return <Badge tom={tomStatus(status)}>{rotuloStatus(status)}</Badge>
}

// Origem da venda = nome do GRUPO (texto livre que o Luiz cria em /regras) ou
// 'a_classificar'. Cor por heurística de palavra-chave; nomes desconhecidos caem
// no tom neutro (não dá pra ter mapa fixo — os grupos são criados livremente).
function tomOrigem(origem: string): BadgeTom {
  if (/org[âa]nic/i.test(origem)) return 'revenue'
  if (/tr[áa]fego|pago|ads/i.test(origem)) return 'warning'
  if (/comercial|vendedor/i.test(origem)) return 'brand'
  return 'muted'
}
function OrigemBadge({ origem }: { origem?: string }) {
  if (!origem || origem === 'a_classificar') return <Badge tom="muted">A classificar</Badge>
  return <Badge tom={tomOrigem(origem)}>{origem}</Badge>
}

// Linha do "Total por afiliado" (RPC hotmart_by_affiliate, agregação no banco)
type AfiliadoRow = { afiliado: string; qtd: number; comissao: number; bruto: number; total: number; liquido_produtor: number }
// Linha do "Total por grupo" (RPC hotmart_by_group): vendas agrupadas pelo grupo
// de origem (modelo v3, classificação por venda via /regras)
type GrupoRow = { grupo: string; vendas: number; bruto: number; total: number; liquido: number }
type FiltroOrigem = 'todas' | 'a_classificar' | 'classificadas'

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
  const [afiliados, setAfiliados] = useState<AfiliadoRow[]>([])
  const [gruposOrigem, setGruposOrigem] = useState<GrupoRow[]>([])
  const [busca, setBusca] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')
  const [filtroOrigem, setFiltroOrigem] = useState<FiltroOrigem>('todas')

  useEffect(() => {
    if (empresas.length && !empresaDestino) setEmpresaDestino(empresaAtiva?.id ?? empresas[0].id)
  }, [empresas, empresaAtiva, empresaDestino])

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 400)
    return () => clearTimeout(t)
  }, [busca])

  // Tabela de vendas: depende de empresa + período + filtro de origem + busca.
  const carregarVendas = useCallback(async () => {
    const pStart: string | null = dataDe || null
    const pEnd: string | null = dataAte || null
    // tabela: 1000 vendas mais recentes (teto do PostgREST)
    let q = supabase.from('hotmart_sales_origin').select('*').order('sale_date', { ascending: false }).limit(1000)
    if (empresaAtiva) q = q.eq('company_id', empresaAtiva.id)
    if (pStart) q = q.gte('sale_date', pStart)
    if (pEnd) q = q.lte('sale_date', pEnd)
    if (filtroOrigem === 'a_classificar') q = q.eq('origem', 'a_classificar')
    else if (filtroOrigem === 'classificadas') q = q.neq('origem', 'a_classificar')
    if (buscaDebounced.trim()) {
      const s = buscaDebounced.trim()
      q = q.or(`product.ilike.%${s}%,src.ilike.%${s}%,sck.ilike.%${s}%,xcod.ilike.%${s}%,affiliate.ilike.%${s}%,origem.ilike.%${s}%,vendedor.ilike.%${s}%,transaction_code.ilike.%${s}%`)
    }
    const { data, error } = await q
    if (error) { setErro('Erro ao carregar vendas: ' + error.message); return }
    setVendas((data as HotmartSale[]) ?? [])
  }, [empresaAtiva, dataDe, dataAte, filtroOrigem, buscaDebounced])

  // KPIs e relatórios agregados: dependem só de empresa + período (não da busca/
  // filtro da tabela). Separado pra não piscar os números ao digitar na busca.
  const carregarTotais = useCallback(async () => {
    const pStart: string | null = dataDe || null
    const pEnd: string | null = dataAte || null
    setErro(null)
    const params = { p_company: empresaAtiva?.id ?? null, p_start: pStart, p_end: pEnd }

    const { data: tot, error: e2 } = await supabase.rpc('hotmart_totals', params)
    if (e2) { setErro('Erro nos totais: ' + e2.message); return }
    const t = tot?.[0]
    setTotais(t
      ? { qtd: Number(t.qtd), total: Number(t.total), bruto: Number(t.bruto), taxas: Number(t.taxas), afiliados: Number(t.afiliados), liquido: Number(t.liquido), foraMoeda: Number(t.fora_moeda) }
      : { qtd: 0, total: 0, bruto: 0, taxas: 0, afiliados: 0, liquido: 0, foraMoeda: 0 })

    // Total por afiliado (agregação no banco; vazio até o refresh_commissions preencher)
    const { data: afi, error: e3 } = await supabase.rpc('hotmart_by_affiliate', params)
    if (e3) { setErro('Erro nos afiliados: ' + e3.message); return }
    setAfiliados(((afi as AfiliadoRow[]) ?? []).map((a) => ({
      afiliado: a.afiliado, qtd: Number(a.qtd), comissao: Number(a.comissao),
      bruto: Number(a.bruto), total: Number(a.total), liquido_produtor: Number(a.liquido_produtor),
    })))

    // Total por grupo de origem (modelo v3: classificação por venda via /regras)
    const { data: grp, error: e4 } = await supabase.rpc('hotmart_by_group', params)
    if (e4) { setErro('Erro por grupo: ' + e4.message); return }
    setGruposOrigem(((grp as GrupoRow[]) ?? []).map((v) => ({
      grupo: v.grupo, vendas: Number(v.vendas),
      bruto: Number(v.bruto), total: Number(v.total), liquido: Number(v.liquido),
    })))
  }, [empresaAtiva, dataDe, dataAte])

  const recarregarTudo = useCallback(() => { carregarVendas(); carregarTotais() }, [carregarVendas, carregarTotais])

  useEffect(() => { carregarVendas() }, [carregarVendas])
  useEffect(() => { carregarTotais() }, [carregarTotais])

  // Realtime: o webhook hotmart-webhook grava/atualiza hotmart_sales → refetch
  // (debounced). 3 das 4 fontes são RPCs agregadas, então re-buscar tudo é mais
  // simples e correto que merge incremental. Filtro server-side por empresa; no
  // consolidado (empresaAtiva null) ouve todas. Só re-subscreve ao trocar empresa.
  useRealtimeRefetch('hotmart_sales', recarregarTudo, {
    filter: empresaAtiva ? `company_id=eq.${empresaAtiva.id}` : undefined,
  })

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
    recarregarTudo()
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
    recarregarTudo()
  }

  // colunas da tabela (reordenáveis/redimensionáveis/ocultáveis via DataTable)
  const colunas = useMemo<DataColumn<HotmartSale>[]>(() => [
    { id: 'sale_date', header: 'Data', size: 100, cell: (v) => <span className="whitespace-nowrap text-fg-muted tnum">{fmtData(v.sale_date)}</span> },
    { id: 'product', header: 'Produto', size: 220, cell: (v) => (
      <span className="text-fg">
        {v.product}
        {v.currency && v.currency !== 'BRL' && (
          <span className="ml-1.5 text-[10px] font-bold text-warning bg-warning-bg border border-border rounded-control px-1 py-0.5 align-middle">{v.currency}</span>
        )}
      </span>
    ) },
    { id: 'origem', header: 'Grupo', size: 110, cell: (v) => <OrigemBadge origem={v.origem} /> },
    { id: 'vendedor', header: 'Vendedor', size: 130, cell: (v) => <span className="text-fg-muted">{v.vendedor || '—'}</span> },
    { id: 'src', header: 'src', size: 140, cell: (v) => <span className="text-xs text-fg-subtle break-all">{v.src || '—'}</span> },
    { id: 'sck', header: 'sck', size: 140, cell: (v) => <span className="text-xs text-fg-subtle break-all">{v.sck || '—'}</span> },
    { id: 'xcod', header: 'xcode', size: 110, cell: (v) => <span className="text-xs text-fg-subtle break-all">{v.xcod || '—'}</span> },
    { id: 'transaction_code', header: 'Transação', size: 130, cell: (v) => <span className="text-xs text-fg-subtle tnum">{v.transaction_code}</span> },
    { id: 'total_amount', header: 'Valor Total', size: 120, align: 'right', cell: (v) => <span className="tnum">{fmtBRL(Number(v.total_amount))}</span> },
    { id: 'gross_amount', header: 'Bruto', size: 110, align: 'right', cell: (v) => <span className="tnum">{fmtBRL(Number(v.gross_amount))}</span> },
    { id: 'hotmart_fee', header: 'Taxa', size: 100, align: 'right', cell: (v) => <span className="text-expense tnum">{fmtBRL(Number(v.hotmart_fee))}</span> },
    { id: 'fee_percentage', header: '% Hotmart', size: 100, align: 'right', cell: (v) => <span className="text-fg-muted whitespace-nowrap tnum">{v.fee_percentage != null ? `${Number(v.fee_percentage)}%` : '—'}</span> },
    { id: 'affiliate', header: 'Afiliado', size: 150, align: 'left', grow: true, cell: (v) => <span className="text-fg-muted">{v.affiliate ?? '—'}</span> },
    { id: 'afiliados', header: 'Afil./Coprod.', size: 120, align: 'right', cell: (v) => <span className="text-warning tnum">{fmtBRL(Number(v.affiliate_commission) + Number(v.coproduction_commission))}</span> },
    { id: 'net_amount', header: 'Líquido', size: 120, align: 'right', cell: (v) => <span className="font-semibold text-revenue tnum">{fmtBRL(Number(v.net_amount))}</span> },
    { id: 'release_date', header: 'Liberação', size: 110, cell: (v) => <span className="whitespace-nowrap text-fg-muted tnum">{fmtData(v.release_date)}</span> },
    { id: 'payment_method', header: 'Pagamento', size: 130, cell: (v) => <span className="text-xs text-fg-muted whitespace-nowrap">{v.payment_method ?? '—'}</span> },
    { id: 'installments', header: 'Parcelas', size: 90, align: 'center', cell: (v) => <span className="text-fg-muted whitespace-nowrap tnum">{v.installments == null ? '—' : v.installments <= 1 ? 'À vista' : `${v.installments}x`}</span> },
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
            <DateRangePicker de={dataDe} ate={dataAte} align="right" onChange={(d, a) => { setDataDe(d); setDataAte(a) }} />
          </div>
        </div>
        {msg && <div className="mt-4"><Alert tom="info">{msg}</Alert></div>}
      </Card>

      {/* 6 KPIs (mais que o teto de 5 do KPIStrip) → grid bespoke com KPICard */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-2">
        <KPICard label="Vendas" valor={totais.qtd} />
        <KPICard label="Valor Total" valor={fmtBRL(totais.total)} />
        <KPICard label="Bruto" valor={fmtBRL(totais.bruto)} />
        <KPICard label="Taxas Hotmart" valor={fmtBRL(totais.taxas)} tom="expense" />
        <KPICard label="Afiliados/Coprod." valor={fmtBRL(totais.afiliados)} tom="warning" />
        <KPICard label="Líquido" valor={fmtBRL(totais.liquido)} tom="revenue" />
      </div>
      <p className={`text-xs text-fg-subtle ${totais.foraMoeda > 0 ? 'mb-3' : 'mb-6'}`}>
        Valor Total = pago pelos compradores (com juros de parcelamento) · Bruto = preço dos produtos (sem juros) · Líquido = bruto − taxas.
      </p>
      {totais.foraMoeda > 0 && (
        <div className="mb-6">
          <Alert tom="warning">
            {totais.foraMoeda} venda{totais.foraMoeda !== 1 ? 's' : ''} em outra moeda não {totais.foraMoeda !== 1 ? 'incluídas' : 'incluída'} nos totais (R$).
          </Alert>
        </div>
      )}

      {/* KPIs por grupo de origem (classificação via /regras) */}
      {gruposOrigem.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle mb-2">Por grupo de origem</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {gruposOrigem.map((g) => (
              <KPICard
                key={g.grupo}
                label={g.grupo === 'a_classificar' ? 'A classificar' : g.grupo}
                valor={`${g.vendas} · ${fmtBRL(g.liquido)}`}
                tom={g.grupo === 'a_classificar' ? 'warning' : 'neutro'}
              />
            ))}
          </div>
        </>
      )}

      <Card>
        <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-fg">Vendas</h2>
            <p className="text-xs text-fg-subtle mt-0.5">
              {vendas.length === 1000 ? 'Primeiras 1000' : vendas.length} {filtroOrigem === 'a_classificar' ? 'sem classificação' : filtroOrigem === 'classificadas' ? 'classificadas' : 'no período'}.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              className="rounded-control border border-border bg-surface px-3 py-1 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand w-48"
              placeholder="Pesquisar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <div className="flex gap-1 shrink-0">
              {(['todas', 'a_classificar', 'classificadas'] as FiltroOrigem[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltroOrigem(f)}
                  className={`px-3 py-1 rounded-control text-xs font-medium transition ${filtroOrigem === f ? 'bg-brand text-white' : 'bg-surface-2 text-fg-muted hover:bg-border'}`}
                >
                  {f === 'todas' ? 'Todas' : f === 'a_classificar' ? 'A classificar' : 'Classificadas'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {vendas.length === 0 ? (
          <Vazio mensagem={buscaDebounced.trim() || filtroOrigem !== 'todas' ? 'Nenhuma venda encontrada para esse filtro.' : 'Nenhuma venda ainda. Clique em Sincronizar com a Hotmart acima — ou importe um CSV exportado de lá.'} />
        ) : (
          <>
            <DataTable
              tableKey="hotmart-sales"
              columns={colunas}
              data={vendas}
              getRowId={(v) => v.id}
              pageSize={50}
            />
            {totais.qtd > vendas.length && filtroOrigem === 'todas' && !buscaDebounced.trim() && (
              <p className="text-xs text-fg-subtle text-center py-3 border-t border-border">
                Carregadas as {vendas.length} vendas mais recentes (de {totais.qtd} aprovadas no período). Os totais acima consideram todas. Refine pela busca ou pelo período.
              </p>
            )}
          </>
        )}
      </Card>

      <Card className="mt-6">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">Total por afiliado</h2>
          <p className="text-xs text-fg-subtle mt-0.5">
            Comissões pagas a afiliados e o líquido que a RB7 recebeu nessas vendas (período selecionado · moeda BRL).
          </p>
        </div>
        {afiliados.length === 0 ? (
          <Vazio mensagem="Nenhuma venda com afiliado no período. Os dados de afiliado são preenchidos automaticamente pelo sync de comissões." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-subtle border-b border-border">
                <th className="font-medium px-5 py-2">Afiliado</th>
                <th className="font-medium px-3 py-2 text-right">Vendas</th>
                <th className="font-medium px-3 py-2 text-right">Comissão</th>
                <th className="font-medium px-3 py-2 text-right">Bruto</th>
                <th className="font-medium px-5 py-2 text-right">Líquido RB7</th>
              </tr>
            </thead>
            <tbody>
              {afiliados.map((a) => (
                <tr key={a.afiliado} className="border-b border-border last:border-0">
                  <td className="px-5 py-2 text-fg">{a.afiliado}</td>
                  <td className="px-3 py-2 text-right tnum text-fg-muted">{a.qtd}</td>
                  <td className="px-3 py-2 text-right tnum text-warning">{fmtBRL(a.comissao)}</td>
                  <td className="px-3 py-2 text-right tnum text-fg-muted">{fmtBRL(a.bruto)}</td>
                  <td className="px-5 py-2 text-right tnum font-medium text-revenue">{fmtBRL(a.liquido_produtor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mt-6">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">Total por grupo de origem</h2>
          <p className="text-xs text-fg-subtle mt-0.5">
            Vendas agrupadas pelo grupo de origem no período · BRL. Classifique as vendas pelas <span className="text-fg-muted">Regras de origem</span>.
          </p>
        </div>
        {gruposOrigem.length === 0 ? (
          <Vazio mensagem="Nenhuma venda no período." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-fg-subtle border-b border-border">
                  <th className="font-medium px-5 py-2">Grupo</th>
                  <th className="font-medium px-3 py-2 text-right">Vendas</th>
                  <th className="font-medium px-3 py-2 text-right">Bruto</th>
                  <th className="font-medium px-3 py-2 text-right">Valor Total</th>
                  <th className="font-medium px-5 py-2 text-right">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {gruposOrigem.map((g) => (
                  <tr key={g.grupo} className="border-b border-border last:border-0">
                    <td className="px-5 py-2"><OrigemBadge origem={g.grupo} /></td>
                    <td className="px-3 py-2 text-right tnum text-fg-muted">{g.vendas}</td>
                    <td className="px-3 py-2 text-right tnum text-fg-muted">{fmtBRL(g.bruto)}</td>
                    <td className="px-3 py-2 text-right tnum text-fg-muted">{fmtBRL(g.total)}</td>
                    <td className="px-5 py-2 text-right tnum font-medium text-revenue">{fmtBRL(g.liquido)}</td>
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
