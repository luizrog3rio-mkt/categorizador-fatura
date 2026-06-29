import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { fmtBRL } from '../lib/format'
import type { Seller } from '../lib/types'
import { Card, PageHeader, ErroBanner, inputCls, Button, Vazio, Alert } from '../components/ui'

// Vendedores: SÓ cadastro + relatório de vendas por vendedor. A ATRIBUIÇÃO
// (src/sck/xcode/afiliado → vendedor) é feita pelas regras de propagação na tela
// /regras (agrupadas por vendedor). O relatório lê da RPC hotmart_seller_report
// (agrupa por hotmart_sale_class.seller_id via view hotmart_sales_origin).

interface SellerReport {
  vendedor: string; vendas: number; bruto: number; total: number; liquido: number; comissao_afiliado: number
}

export default function Vendedores() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [relatorio, setRelatorio] = useState<SellerReport[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const [r1, r2] = await Promise.all([
      supabase.from('sellers').select('*').order('name'),
      supabase.rpc('hotmart_seller_report', { p_company: null, p_start: null, p_end: null }),
    ])
    if (r1.error) setErro('Erro ao carregar vendedores: ' + r1.error.message)
    else setSellers((r1.data as Seller[]) ?? [])
    if (r2.error) setErro('Erro ao carregar o relatório: ' + r2.error.message)
    else setRelatorio(((r2.data as SellerReport[]) ?? []).map((v) => ({
      vendedor: v.vendedor, vendas: Number(v.vendas), bruto: Number(v.bruto),
      total: Number(v.total), liquido: Number(v.liquido), comissao_afiliado: Number(v.comissao_afiliado),
    })))
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const addSeller = async () => {
    const nome = novoNome.trim()
    if (!nome) return
    setSalvando(true)
    const { error } = await supabase.from('sellers').insert({ name: nome })
    setSalvando(false)
    if (error) { setErro('Erro ao cadastrar vendedor: ' + error.message); return }
    setNovoNome('')
    carregar()
  }

  const toggleSeller = async (s: Seller) => {
    const { error } = await supabase.from('sellers').update({ active: !s.active }).eq('id', s.id)
    if (error) { setErro('Erro ao atualizar vendedor: ' + error.message); return }
    setSellers((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Vendedores"
        subtitulo="Cadastre os vendedores e acompanhe as vendas atribuídas a cada um. O vínculo de cada sck/afiliado ao vendedor é feito na tela Origem."
      />

      <ErroBanner mensagem={erro} />

      {/* cadastro de vendedores */}
      <Card className="p-5">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-60">
            <label className="block text-sm font-medium mb-1">Novo vendedor</label>
            <input
              className={inputCls}
              placeholder="Nome do vendedor"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addSeller() }}
            />
          </div>
          <Button onClick={addSeller} loading={salvando} disabled={!novoNome.trim()}>Adicionar</Button>
        </div>
        {sellers.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {sellers.map((s) => (
              <span
                key={s.id}
                className={`inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm ${s.active ? 'text-fg' : 'text-fg-subtle line-through'}`}
              >
                {s.name}
                <button
                  onClick={() => toggleSeller(s)}
                  className="text-xs text-fg-subtle hover:text-fg-muted"
                  title={s.active ? 'Desativar' : 'Reativar'}
                >
                  {s.active ? 'desativar' : 'reativar'}
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Alert tom="info">
        Para atribuir vendas a um vendedor, vá em <Link to="/regras" className="text-brand font-medium hover:underline">Regras de origem</Link>:
        abra o vendedor e cadastre as condições (<span className="text-fg-muted">src</span>/<span className="text-fg-muted">sck</span>/<span className="text-fg-muted">xcode</span>/<span className="text-fg-muted">afiliado</span>) que classificam as vendas dele.
      </Alert>

      {/* relatório de vendas por vendedor */}
      <Card>
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">Vendas por vendedor</h2>
          <p className="text-xs text-fg-subtle mt-0.5">Vendas atribuídas a cada vendedor pelos canais Comercial vinculados a ele (BRL · aprovadas). Inclui sck, afiliado e reclassificações manuais.</p>
        </div>
        {carregando ? (
          <Vazio mensagem="Carregando…" />
        ) : relatorio.length === 0 ? (
          <Vazio mensagem="Nenhuma venda atribuída ainda. Vincule os canais Comercial aos vendedores na tela Origem." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead>
                <tr className="border-b border-border text-xs text-fg-subtle uppercase tracking-wide">
                  <th className="text-left px-4 h-10 font-medium">Vendedor</th>
                  <th className="text-right px-4 h-10 font-medium">Vendas</th>
                  <th className="text-right px-4 h-10 font-medium">Bruto</th>
                  <th className="text-right px-4 h-10 font-medium">Comissão afiliado</th>
                  <th className="text-right px-4 h-10 font-medium">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.map((v) => (
                  <tr key={v.vendedor} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-2 text-fg">{v.vendedor}</td>
                    <td className="px-4 py-2 text-right text-fg-muted">{v.vendas}</td>
                    <td className="px-4 py-2 text-right text-fg-muted">{fmtBRL(v.bruto)}</td>
                    <td className="px-4 py-2 text-right text-warning">{v.comissao_afiliado ? fmtBRL(v.comissao_afiliado) : '—'}</td>
                    <td className="px-4 py-2 text-right font-medium text-revenue">{fmtBRL(v.liquido)}</td>
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
