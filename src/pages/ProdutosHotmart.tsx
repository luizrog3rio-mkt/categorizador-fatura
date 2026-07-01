import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtBRL } from '../lib/format'
import type { DreProduct } from '../lib/types'
import { Card, PageHeader, ErroBanner, KPICard, KPIStrip, inputCls } from '../components/ui'
import { useToast } from '../components/Toast'

// De-para SKU cru do Hotmart → produto da DRE. Alimenta a "DRE por produto":
// receita por produto = soma do Hotmart de cada SKU mapeado. SKU "A classificar"
// (sem produto) cai num balde à parte na DRE. Auto-sugerido na migration; aqui o
// Luiz refina os ambíguos (combos, eventos, cursos diversos).
//
// A CHAVE é o product_id (id numérico da Hotmart), não o nome — produtos homônimos
// com ids diferentes (ex.: "Mentoria Apruma" = 5 ids) aparecem como LINHAS SEPARADAS,
// cada uma mapeável para um Produto DRE / Conta distintos. (reforma 2026-07-01)

interface ResumoSku {
  product_id: number
  product: string
  vendas: number
  bruto: number
  liquido: number
  dre_product_id: string | null
  chart_of_account_id: string | null
}

interface ContaReceita { id: string; code: string; name: string }

export default function ProdutosHotmart() {
  const toast = useToast()
  const [lista, setLista] = useState<ResumoSku[]>([])
  const [produtos, setProdutos] = useState<DreProduct[]>([])
  const [contas, setContas] = useState<ContaReceita[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [soNaoClassificados, setSoNaoClassificados] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.rpc('hotmart_produtos'),
      supabase.from('dre_products').select('*').eq('active', true).order('sort_order'),
      supabase.from('chart_of_accounts').select('id, code, name').eq('nature', 'revenue').eq('active', true).order('code'),
      supabase.from('hotmart_product_map').select('product_id, chart_of_account_id'),
    ])
    // a RPC hotmart_produtos não traz a conta direta — vem do mapa (r4), mesclada aqui por product_id
    const contaPorProduto = new Map((r4.data ?? []).map((m) => [(m as { product_id: number }).product_id, (m as { chart_of_account_id: string | null }).chart_of_account_id]))
    if (r1.error) setErro('Erro ao carregar os produtos do Hotmart: ' + r1.error.message)
    else setLista(((r1.data as ResumoSku[]) ?? [])
      .map((r) => ({ ...r, chart_of_account_id: contaPorProduto.get(r.product_id) ?? null }))
      .sort((a, b) => b.liquido - a.liquido))
    setProdutos((r2.data as DreProduct[]) ?? [])
    setContas((r3.data as ContaReceita[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const setProduto = async (row: ResumoSku, dreProductId: string | null) => {
    setLista((prev) => prev.map((r) => (r.product_id === row.product_id ? { ...r, dre_product_id: dreProductId } : r)))
    const { error } = await supabase
      .from('hotmart_product_map')
      .upsert({ product_id: row.product_id, product: row.product, dre_product_id: dreProductId, updated_at: new Date().toISOString() }, { onConflict: 'product_id' })
    if (error) { setErro('Erro ao salvar o mapeamento: ' + error.message); carregar() }
    else toast(dreProductId ? 'Produto mapeado' : 'Mapeamento removido')
  }

  // upsert SÓ da conta direta — preserva o dre_product_id (não está no payload → não mexe no conflito)
  const setConta = async (row: ResumoSku, contaId: string | null) => {
    setLista((prev) => prev.map((r) => (r.product_id === row.product_id ? { ...r, chart_of_account_id: contaId } : r)))
    const { error } = await supabase
      .from('hotmart_product_map')
      .upsert({ product_id: row.product_id, product: row.product, chart_of_account_id: contaId, updated_at: new Date().toISOString() }, { onConflict: 'product_id' })
    if (error) { setErro('Erro ao salvar a conta: ' + error.message); carregar() }
    else toast(contaId ? 'Conta vinculada' : 'Conta removida')
  }

  const resumo = useMemo(() => {
    const naoClass = lista.filter((r) => !r.dre_product_id)
    return {
      total: lista.length,
      classificados: lista.length - naoClass.length,
      aClassificar: naoClass.length,
      liquidoAClassificar: naoClass.reduce((s, r) => s + r.liquido, 0),
    }
  }, [lista])

  const exibidos = soNaoClassificados ? lista.filter((r) => !r.dre_product_id) : lista

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Produtos Hotmart → DRE"
        subtitulo='Cada linha é um produto da Hotmart pelo seu ID (produtos de mesmo nome aparecem separados). "Produto da DRE" alimenta a DRE por Produto; "Conta de Receita (direto)" rota a receita pra uma conta na DRE por competência (tem prioridade sobre a conta do Produto DRE).'
      />

      <ErroBanner mensagem={erro} />

      <KPIStrip cols={4}>
        <KPICard bare label="Produtos no Hotmart" valor={resumo.total} />
        <KPICard bare label="Classificados" valor={resumo.classificados} tom="revenue" />
        <KPICard bare label="A classificar" valor={resumo.aClassificar} tom={resumo.aClassificar > 0 ? 'warning' : 'revenue'} />
        <KPICard bare label="Líquido a classificar" valor={fmtBRL(resumo.liquidoAClassificar)} tom={resumo.aClassificar > 0 ? 'warning' : 'neutro'} />
      </KPIStrip>

      <Card>
        <div className="flex items-center justify-between p-3 border-b border-border">
          <p className="text-sm text-fg-muted">
            {exibidos.length} produto{exibidos.length !== 1 ? 's' : ''}
          </p>
          <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
            <input type="checkbox" className="accent-brand" checked={soNaoClassificados} onChange={(e) => setSoNaoClassificados(e.target.checked)} />
            Só os "A classificar"
          </label>
        </div>

        {carregando ? (
          <p className="text-center text-fg-subtle py-10 text-sm">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead>
                <tr className="border-b border-border text-xs text-fg-subtle uppercase tracking-wide">
                  <th className="text-left px-4 h-10 font-medium">Produto no Hotmart</th>
                  <th className="text-right px-4 h-10 font-medium">ID</th>
                  <th className="text-right px-4 h-10 font-medium">Vendas</th>
                  <th className="text-right px-4 h-10 font-medium">Líquido</th>
                  <th className="text-left px-4 h-10 font-medium w-56">Produto da DRE</th>
                  <th className="text-left px-4 h-10 font-medium w-64">Conta de Receita (direto)</th>
                </tr>
              </thead>
              <tbody>
                {exibidos.map((r) => (
                  <tr key={r.product_id} className={`border-b border-border last:border-0 hover:bg-surface-2 ${!r.dre_product_id ? 'bg-warning-bg/40' : ''}`}>
                    <td className="px-4 py-2 text-fg">{r.product}</td>
                    <td className="px-4 py-2 text-right text-fg-subtle">{r.product_id}</td>
                    <td className="px-4 py-2 text-right text-fg-muted">{r.vendas}</td>
                    <td className="px-4 py-2 text-right font-medium text-fg">{fmtBRL(r.liquido)}</td>
                    <td className="px-4 py-2">
                      <select
                        className={inputCls + (!r.dre_product_id ? ' border-warning text-warning' : '')}
                        value={r.dre_product_id ?? ''}
                        onChange={(e) => setProduto(r, e.target.value || null)}
                      >
                        <option value="">— A classificar —</option>
                        {produtos.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className={inputCls}
                        value={r.chart_of_account_id ?? ''}
                        onChange={(e) => setConta(r, e.target.value || null)}
                      >
                        <option value="">— (usa o Produto DRE / a classificar) —</option>
                        {contas.map((c) => (
                          <option key={c.id} value={c.id}>{c.code} – {c.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {exibidos.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-fg-subtle text-sm">Nenhum produto.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
