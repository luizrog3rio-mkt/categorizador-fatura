import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { Card, PageHeader, Modal, Badge, Vazio, ErroBanner, inputCls, btnPrimario, btnSecundario } from '../components/ui'

interface DreProduct {
  id: string
  company_id: string
  name: string
  active: boolean
  sort_order: number
  created_at: string
}

interface FormState {
  id?: string
  name: string
  sort_order: string
  active: boolean
}

const formVazio = (): FormState => ({ name: '', sort_order: '0', active: true })

export default function DreProducts() {
  const { isAdmin, empresaAtiva } = useApp()
  const [produtos, setProdutos] = useState<DreProduct[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<FormState>(formVazio())

  const carregar = useCallback(async () => {
    setErro(null)
    let q = supabase.from('dre_products').select('*').order('sort_order')
    if (empresaAtiva) q = q.eq('company_id', empresaAtiva.id)
    const { data, error } = await q
    if (error) { setErro('Erro ao carregar produtos DRE: ' + error.message); return }
    setProdutos((data as DreProduct[]) ?? [])
  }, [empresaAtiva])

  useEffect(() => { carregar() }, [carregar])

  const abrirNovo = () => {
    const proximaOrdem = produtos.length > 0 ? Math.max(...produtos.map((p) => p.sort_order)) + 1 : 1
    setForm({ name: '', sort_order: String(proximaOrdem), active: true })
    setModal(true)
  }

  const abrirEdicao = (p: DreProduct) => {
    setForm({ id: p.id, name: p.name, sort_order: String(p.sort_order), active: p.active })
    setModal(true)
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    const nome = form.name.trim()
    if (!nome) return
    setSalvando(true)
    setErro(null)
    const sortOrder = parseInt(form.sort_order, 10) || 0
    if (form.id) {
      const { error } = await supabase
        .from('dre_products')
        .update({ name: nome, sort_order: sortOrder, active: form.active })
        .eq('id', form.id)
      if (error) { setErro('Erro ao salvar: ' + error.message); setSalvando(false); return }
    } else {
      const ins: Record<string, unknown> = {
        name: nome,
        sort_order: sortOrder,
        active: form.active,
      }
      if (empresaAtiva) ins.company_id = empresaAtiva.id
      const { error } = await supabase.from('dre_products').insert(ins)
      if (error) { setErro('Erro ao criar: ' + error.message); setSalvando(false); return }
    }
    setSalvando(false)
    setModal(false)
    carregar()
  }

  const excluir = async (p: DreProduct) => {
    if (!window.confirm(`Excluir o produto DRE "${p.name}"?`)) return
    const { error } = await supabase.from('dre_products').delete().eq('id', p.id)
    if (error) { setErro('Erro ao excluir: ' + error.message); return }
    carregar()
  }

  const mover = async (index: number, direcao: -1 | 1) => {
    const outro = index + direcao
    if (outro < 0 || outro >= produtos.length) return
    const a = produtos[index]
    const b = produtos[outro]
    const { error: e1 } = await supabase.from('dre_products').update({ sort_order: b.sort_order }).eq('id', a.id)
    const { error: e2 } = await supabase.from('dre_products').update({ sort_order: a.sort_order }).eq('id', b.id)
    if (e1 || e2) { setErro('Erro ao reordenar: ' + (e1?.message ?? e2?.message)); return }
    carregar()
  }

  return (
    <div>
      <PageHeader
        titulo="Produtos DRE"
        subtitulo="Configure os produtos que aparecem nas linhas da DRE"
        acao={
          isAdmin ? (
            <button onClick={abrirNovo} className={btnPrimario}>
              <Plus size={16} /> Novo produto
            </button>
          ) : undefined
        }
      />

      <ErroBanner mensagem={erro} />

      <Card className="p-5">
        {produtos.length === 0 ? (
          <Vazio mensagem="Nenhum produto DRE cadastrado. Crie o primeiro no botão acima." />
        ) : (
          <div className="divide-y divide-border">
            {produtos.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  {isAdmin && (
                    <div className="flex flex-col shrink-0">
                      <button
                        onClick={() => mover(i, -1)}
                        disabled={i === 0}
                        title="Mover para cima"
                        className="text-fg-subtle hover:text-fg-muted disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => mover(i, 1)}
                        disabled={i === produtos.length - 1}
                        title="Mover para baixo"
                        className="text-fg-subtle hover:text-fg-muted disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  )}
                  <span className="text-xs text-fg-subtle w-6 text-right shrink-0 font-mono tnum">{p.sort_order}</span>
                  <span className="text-sm font-medium text-fg truncate">{p.name}</span>
                  <span className="shrink-0">
                    <Badge tom={p.active ? 'revenue' : 'muted'}>{p.active ? 'Ativa' : 'Inativa'}</Badge>
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      title="Editar"
                      onClick={() => abrirEdicao(p)}
                      className="text-fg-subtle hover:text-brand p-1"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      title="Excluir"
                      onClick={() => excluir(p)}
                      className="text-fg-subtle hover:text-expense p-1"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        titulo={form.id ? 'Editar produto DRE' : 'Novo produto DRE'}
        aberto={modal}
        onFechar={() => setModal(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome *</label>
            <input
              required
              autoFocus
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Consultoria, Produto A"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Ordem</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            />
            <p className="text-xs text-fg-subtle mt-1">Itens com menor número aparecem primeiro.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="dre-product-active"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-border-strong text-brand focus:ring-brand"
            />
            <label htmlFor="dre-product-active" className="text-sm font-medium text-fg-muted select-none">
              Produto ativo
            </label>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={() => setModal(false)} className={btnSecundario}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className={btnPrimario}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
