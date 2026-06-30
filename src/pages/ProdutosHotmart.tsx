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

interface ResumoSku {
  product: string
  vendas: number
  bruto: number
  liquido: number
  dre_product_id: string | null
}

export default function ProdutosHotmart() {
  const toast = useToast()
  const [lista, setLista] = useState<ResumoSku[]>([])
  const [produtos, setProdutos] = useState<DreProduct[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [soNaoClassificados, setSoNaoClassificados] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const [r1, r2] = await Promise.all([
      supabase.rpc('hotmart_produtos'),
      supabase.from('dre_products').select('*').eq('active', true).order('sort_order'),
    ])
    if (r1.error) setErro('Erro ao carregar os produtos do Hotmart: ' + r1.error.message)
    else setLista(((r1.data as ResumoSku[]) ?? []).slice().sort((a, b) => b.liquido - a.liquido))
    setProdutos((r2.data as DreProduct[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const setProduto = async (sku: string, dreProductId: string | null) => {
    setLista((prev) => prev.map((r) => (r.product === sku ? { ...r, dre_product_id: dreProductId } : r)))
    const { error } = await supabase
      .from('hotmart_product_map')
      .upsert({ product: sku, dre_product_id: dreProductId, updated_at: new Date().toISOString() }, { onConflict: 'product' })
    if (error) { setErro('Erro ao salvar o mapeamento: ' + error.message); carregar() }
    else toast(dreProductId ? 'Produto mapeado' : 'Mapeamento removido')
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
        subtitulo="Associe cada produto vendido no Hotmart a um produto da DRE (usado na DRE por produto)"
      />

      <ErroBanner mensagem={erro} />

      <KPIStrip cols={4}>
        <KPICard bare label="SKUs no Hotmart" valor={resumo.total} />
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
                  <th className="text-right px-4 h-10 font-medium">Vendas</th>
                  <th className="text-right px-4 h-10 font-medium">Líquido</th>
                  <th className="text-left px-4 h-10 font-medium w-64">Produto da DRE</th>
                </tr>
              </thead>
              <tbody>
                {exibidos.map((r) => (
                  <tr key={r.product} className={`border-b border-border last:border-0 hover:bg-surface-2 ${!r.dre_product_id ? 'bg-warning-bg/40' : ''}`}>
                    <td className="px-4 py-2 text-fg">{r.product}</td>
                    <td className="px-4 py-2 text-right text-fg-muted">{r.vendas}</td>
                    <td className="px-4 py-2 text-right font-medium text-fg">{fmtBRL(r.liquido)}</td>
                    <td className="px-4 py-2">
                      <select
                        className={inputCls + (!r.dre_product_id ? ' border-warning text-warning' : '')}
                        value={r.dre_product_id ?? ''}
                        onChange={(e) => setProduto(r.product, e.target.value || null)}
                      >
                        <option value="">— A classificar —</option>
                        {produtos.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {exibidos.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-10 text-fg-subtle text-sm">Nenhum produto.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
