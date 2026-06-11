import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { TAG_COLORS, corDaCategoria } from '../lib/fatura'
import { Card, PageHeader, Modal, Vazio, ErroBanner, inputCls, btnPrimario } from '../components/ui'

// Etapa 8 — Gestão de Categorias. NÃO é port direto: a tabela viva `categories`
// difere do `categorias` do rb7 (color_index, sem tipo/ativa). Página nova pros
// 2 vocabulários vivos. Capacidade que o app antigo não tinha (lacuna da
// auditoria): RENOMEAR com cascade nos rótulos de TEXTO (transactions.category
// etc. referenciam por nome), recolorir e excluir.
type Vocab = 'transacao' | 'compra'
interface CatRow { id: string; name: string; color_index: number }

const TABELA: Record<Vocab, string> = { transacao: 'categories', compra: 'purchase_item_categories' }
// colunas onde o nome aparece como TEXTO (cascade obrigatório no rename)
const TEXT_REFS: Record<Vocab, { tabela: string; col: string }[]> = {
  transacao: [{ tabela: 'transactions', col: 'category' }, { tabela: 'auto_rules', col: 'category' }],
  compra: [{ tabela: 'purchase_items', col: 'category' }],
}
const TABELA_USO: Record<Vocab, string> = { transacao: 'transactions', compra: 'purchase_items' }

export default function Categorias() {
  const { session, isAdmin } = useApp()
  const [vocab, setVocab] = useState<Vocab>('transacao')
  const [cats, setCats] = useState<CatRow[]>([])
  const [uso, setUso] = useState<Record<string, number>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<{ id?: string; name: string; colorIndex: number }>({ name: '', colorIndex: 0 })

  const carregar = useCallback(async () => {
    setErro(null)
    const { data, error } = await supabase.from(TABELA[vocab]).select('*').order('name')
    if (error) { setErro('Erro ao carregar categorias: ' + error.message); return }
    setCats((data as CatRow[]) ?? [])
    const { data: usos } = await supabase.from(TABELA_USO[vocab]).select('category')
    const m: Record<string, number> = {}
    usos?.forEach((u: { category: string | null }) => { if (u.category) m[u.category] = (m[u.category] ?? 0) + 1 })
    setUso(m)
  }, [vocab])

  useEffect(() => { carregar() }, [carregar])

  const abrirNovo = () => { setForm({ name: '', colorIndex: cats.length % TAG_COLORS.length }); setModal(true) }
  const abrirEdicao = (c: CatRow) => { setForm({ id: c.id, name: c.name, colorIndex: c.color_index }); setModal(true) }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    const nome = form.name.trim()
    if (!nome) return
    setErro(null)
    if (form.id) {
      const original = cats.find((c) => c.id === form.id)
      if (original && cats.some((c) => c.id !== form.id && c.name.toLowerCase() === nome.toLowerCase())) {
        setErro(`Já existe uma categoria "${nome}".`); return
      }
      const { error } = await supabase.from(TABELA[vocab]).update({ name: nome, color_index: form.colorIndex }).eq('id', form.id)
      if (error) { setErro('Erro ao salvar: ' + error.message); return }
      // cascade do rename nos refs de TEXTO (FK refs como entries.category_id
      // acompanham por id automaticamente). Falha aqui deixaria rótulos órfãos
      // em silêncio — por isso o erro PRECISA aparecer.
      if (original && original.name !== nome) {
        const falhas: string[] = []
        for (const ref of TEXT_REFS[vocab]) {
          const { error: eRef } = await supabase.from(ref.tabela).update({ [ref.col]: nome }).eq(ref.col, original.name)
          if (eRef) falhas.push(`${ref.tabela}: ${eRef.message}`)
        }
        if (falhas.length) {
          setErro(
            `A categoria foi renomeada, mas falhou ao atualizar os rótulos em: ${falhas.join(' · ')}. ` +
            `Itens antigos podem ter ficado com o nome "${original.name}" — renomeie de volta e tente de novo.`
          )
        }
      }
    } else {
      if (cats.some((c) => c.name.toLowerCase() === nome.toLowerCase())) { setErro(`Já existe uma categoria "${nome}".`); return }
      const { error } = await supabase.from(TABELA[vocab]).insert({ user_id: session?.user.id, name: nome, color_index: form.colorIndex })
      if (error) { setErro('Erro ao criar: ' + error.message); return }
    }
    setModal(false)
    carregar()
  }

  const excluir = async (c: CatRow) => {
    const n = uso[c.name] ?? 0
    const aviso = n > 0
      ? `Excluir "${c.name}"?\n\n${n} item(ns) usam esta categoria — eles mantêm o rótulo como texto, mas a categoria some do seletor e dos filtros.`
      : `Excluir "${c.name}"?`
    if (!window.confirm(aviso)) return
    const { error } = await supabase.from(TABELA[vocab]).delete().eq('id', c.id)
    if (error) { setErro('Erro ao excluir: ' + error.message); return }
    carregar()
  }

  return (
    <div>
      <PageHeader
        titulo="Categorias"
        subtitulo="Gerencie as categorias de transações e de compras"
        acao={<button onClick={abrirNovo} disabled={!isAdmin} className={btnPrimario}><Plus size={16} /> Nova categoria</button>}
      />

      <ErroBanner mensagem={erro} />

      <div className="inline-flex bg-slate-100 rounded-lg p-1 mb-6">
        {([['transacao', 'Transações'], ['compra', 'Compras']] as [Vocab, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setVocab(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${vocab === v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {cats.length === 0 ? (
          <Vazio mensagem="Nenhuma categoria. Crie a primeira no botão acima." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cats.map((c) => {
              const cor = corDaCategoria(c.color_index)
              const n = uso[c.name] ?? 0
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                      style={{ background: cor.bg, color: cor.text, border: `1px solid ${cor.border}` }}
                    >
                      {c.name}
                    </span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{n > 0 ? `${n} uso${n !== 1 ? 's' : ''}` : 'sem uso'}</span>
                  </div>
                  {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button title="Editar" onClick={() => abrirEdicao(c)} className="text-slate-400 hover:text-indigo-600 p-1"><Pencil size={15} /></button>
                    <button title="Excluir" onClick={() => excluir(c)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                  </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Modal titulo={form.id ? 'Editar categoria' : 'Nova categoria'} aberto={modal} onFechar={() => setModal(false)}>
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome *</label>
            <input required autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Cor</label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((cor, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setForm({ ...form, colorIndex: i })}
                  className={`w-8 h-8 rounded-full transition ${form.colorIndex === i ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
                  style={{ background: cor.bg, border: `2px solid ${cor.border}` }}
                  title={`Cor ${i + 1}`}
                />
              ))}
            </div>
          </div>
          {form.id && (
            <p className="text-xs text-slate-400">
              Renomear atualiza o rótulo em todas as transações/itens que usam esta categoria.
            </p>
          )}
          <button type="submit" className={btnPrimario + ' w-full justify-center'}>Salvar</button>
        </form>
      </Modal>
    </div>
  )
}
