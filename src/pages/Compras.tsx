import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { useFaturaWorld } from '../hooks/useFaturaWorld'
import PurchaseItemsTab, { type NovoItem } from '../components/fatura/PurchaseItemsTab'
import { PageHeader, ErroBanner } from '../components/ui'
import type { PurchaseItem } from '../lib/types'

// Etapa 3 — Compras pendentes (global). Port da view `showPending` do App.jsx:
// itens com invoice_id null, agrupados por mês desc, "não entram em totais".
// Ao importar uma fatura, o modal de pendentes (Etapa 2) oferece anexá-los.
export default function Compras() {
  const { session, recarregarPendentes } = useApp()
  const { purchaseCategorias, erro: erroWorld, addPurchaseCategoria } = useFaturaWorld()
  const [items, setItems] = useState<PurchaseItem[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('purchase_items')
      .select('*')
      .is('invoice_id', null)
      .order('month', { ascending: false })
      .order('created_at')
    if (error) setErro('Erro ao carregar compras pendentes: ' + error.message)
    setItems(data ?? [])
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const addItem = async (item: NovoItem) => {
    if (!session) return
    const { data, error } = await supabase
      .from('purchase_items')
      .insert({
        user_id: session.user.id,
        invoice_id: null,
        description: item.description,
        amount: item.amount === '' || item.amount == null ? null : Number(item.amount),
        category: item.category || null,
        month: item.month || null,
        purchase_date: item.purchaseDate || null,
        payment_method: item.paymentMethod || null,
      })
      .select()
      .single()
    if (error) { setErro('Erro ao adicionar item: ' + error.message); return }
    if (data) { setItems((prev) => [...prev, data]); recarregarPendentes() }
  }

  const updateItem = async (id: string, fields: Partial<PurchaseItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...fields } : it)))
    const { error } = await supabase.from('purchase_items').update(fields).eq('id', id)
    if (error) setErro('Erro ao salvar item: ' + error.message)
  }

  const deleteItem = async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
    const { error } = await supabase.from('purchase_items').delete().eq('id', id)
    if (error) setErro('Erro ao excluir item: ' + error.message)
    else recarregarPendentes()
  }

  return (
    <div>
      <PageHeader
        titulo="🛒 Compras pendentes"
        subtitulo="Anotações aguardando a próxima fatura — não entram em totais nem no dashboard"
      />
      <ErroBanner mensagem={erro ?? erroWorld} />
      {/* a tab tem padding próprio (20px) — margem negativa alinha às bordas da página */}
      <div style={{ margin: '0 -20px' }}>
        <PurchaseItemsTab
          items={items}
          categories={purchaseCategorias}
          onAdd={addItem}
          onUpdate={updateItem}
          onDelete={deleteItem}
          onAddCategory={addPurchaseCategoria}
          isPending
        />
      </div>
    </div>
  )
}
