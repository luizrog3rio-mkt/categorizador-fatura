import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Pencil, CheckCircle2, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, fmtData, hoje } from '../lib/format'
import { corDaCategoria } from '../lib/fatura'
import type { Account, Category, Entry, EntryType } from '../lib/types'
import { Card, PageHeader, StatusBadge, Badge, Vazio, Modal, ErroBanner, inputCls, btnPrimario } from '../components/ui'

// Etapa 4 — Contas a Pagar/Receber. Port do Lancamentos.tsx do rb7 adaptado
// pro schema EN (tabela `entries`). Adaptações vs a fonte:
//  - `lancamentos`→`entries` e todas as colunas PT→EN; enums EN.
//  - categoria referencia a tabela VIVA `categories` (color_index, sem
//    dimensão pagar/receber — Fase 1c); ambos os tipos compartilham a mesma
//    lista de categorias até a Fase 3 unificar.
//  - embed de accounts precisa do hint !account_id (entries tem 2 FKs pra
//    accounts: account_id e invoice_account_id → PGRST201 sem o hint).
//  - erros aparecem em banner (o rb7 também engolia).

interface FormState {
  id?: string
  company_id: string
  account_id: string
  category_id: string
  description: string
  amount: string
  issue_date: string
  due_date: string
  payment_date: string
  counterparty: string
  notes: string
}

const formVazio = (companyId: string): FormState => ({
  company_id: companyId,
  account_id: '',
  category_id: '',
  description: '',
  amount: '',
  issue_date: hoje(),
  due_date: hoje(),
  payment_date: '',
  counterparty: '',
  notes: '',
})

export default function Lancamentos({ tipo }: { tipo: EntryType }) {
  const { empresas, empresaAtiva, session } = useApp()
  const [lancamentos, setLancamentos] = useState<Entry[]>([])
  const [categorias, setCategorias] = useState<Category[]>([])
  const [contas, setContas] = useState<Account[]>([])
  const [filtroStatus, setFiltroStatus] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState<FormState>(formVazio(''))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    let q = supabase
      .from('entries')
      .select('*, category:categories(*), account:accounts!account_id(*)')
      .eq('type', tipo)
      .order('due_date')
    if (empresaAtiva) q = q.eq('company_id', empresaAtiva.id)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data, error } = await q
    if (error) { setErro('Erro ao carregar lançamentos: ' + error.message); return }
    setLancamentos((data as Entry[]) ?? [])
  }, [tipo, empresaAtiva, filtroStatus])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    // categorias vivas (compartilhadas entre pagar/receber até a Fase 3)
    supabase.from('categories').select('*').order('name').then(({ data }) => setCategorias(data ?? []))
    supabase.from('accounts').select('*').eq('active', true).order('name').then(({ data }) => setContas(data ?? []))
  }, [])

  const abrirNovo = () => {
    setForm(formVazio(empresaAtiva?.id ?? empresas[0]?.id ?? ''))
    setModalAberto(true)
  }

  const abrirEdicao = (l: Entry) => {
    setForm({
      id: l.id,
      company_id: l.company_id,
      account_id: l.account_id ?? '',
      category_id: l.category_id ?? '',
      description: l.description,
      amount: String(l.amount),
      issue_date: l.issue_date,
      due_date: l.due_date,
      payment_date: l.payment_date ?? '',
      counterparty: l.counterparty ?? '',
      notes: l.notes ?? '',
    })
    setModalAberto(true)
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    const payload = {
      company_id: form.company_id,
      account_id: form.account_id || null,
      category_id: form.category_id || null,
      type: tipo,
      description: form.description,
      amount: parseFloat(form.amount.replace(',', '.')),
      issue_date: form.issue_date,
      due_date: form.due_date,
      payment_date: form.payment_date || null,
      status: form.payment_date ? 'paid' : form.due_date < hoje() ? 'overdue' : 'pending',
      counterparty: form.counterparty || null,
      notes: form.notes || null,
      ...(form.id ? {} : { created_by: session?.user.id }),
    }
    const { error } = form.id
      ? await supabase.from('entries').update(payload).eq('id', form.id)
      : await supabase.from('entries').insert(payload)
    setSalvando(false)
    if (error) { setErro('Erro ao salvar lançamento: ' + error.message); return }
    setModalAberto(false)
    carregar()
  }

  const marcarPago = async (l: Entry) => {
    const { error } = await supabase.from('entries').update({ payment_date: hoje(), status: 'paid' }).eq('id', l.id)
    if (error) { setErro('Erro ao marcar como pago: ' + error.message); return }
    carregar()
  }

  const excluir = async (l: Entry) => {
    if (!window.confirm(`Excluir "${l.description}"?`)) return
    const { error } = await supabase.from('entries').delete().eq('id', l.id)
    if (error) { setErro('Erro ao excluir lançamento: ' + error.message); return }
    carregar()
  }

  const totais = useMemo(() => {
    const aberto = lancamentos.filter((l) => l.status === 'pending' || l.status === 'overdue')
    return {
      aberto: aberto.reduce((s, l) => s + Number(l.amount), 0),
      atrasado: lancamentos.filter((l) => l.status === 'overdue').reduce((s, l) => s + Number(l.amount), 0),
      pago: lancamentos.filter((l) => l.status === 'paid').reduce((s, l) => s + Number(l.amount), 0),
    }
  }, [lancamentos])

  const ehPagar = tipo === 'payable'

  return (
    <div>
      <PageHeader
        titulo={ehPagar ? 'Contas a Pagar' : 'Contas a Receber'}
        subtitulo="Fluxo: Emissão → Vencimento → Pagamento"
        acao={
          <button onClick={abrirNovo} className={btnPrimario}>
            <Plus size={16} /> Novo lançamento
          </button>
        }
      />

      <ErroBanner mensagem={erro} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Em aberto</p>
          <p className="text-xl font-bold text-amber-600 mt-1">{fmtBRL(totais.aberto)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Atrasado</p>
          <p className="text-xl font-bold text-red-600 mt-1">{fmtBRL(totais.atrasado)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">{ehPagar ? 'Pago' : 'Recebido'}</p>
          <p className="text-xl font-bold text-green-600 mt-1">{fmtBRL(totais.pago)}</p>
        </Card>
      </div>

      <div className="mb-4">
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className={inputCls + ' max-w-48'}>
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="overdue">Atrasado</option>
          <option value="paid">{ehPagar ? 'Pago' : 'Recebido'}</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      <Card>
        {lancamentos.length === 0 ? (
          <Vazio mensagem="Nenhum lançamento encontrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Emissão</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3">Pagamento</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{l.description}</p>
                      {l.counterparty && <p className="text-xs text-slate-400">{l.counterparty}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {l.category ? <Badge cor={corDaCategoria(l.category.color_index).text}>{l.category.name}</Badge> : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtData(l.issue_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtData(l.due_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtData(l.payment_date)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtBRL(Number(l.amount))}</td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        {l.status !== 'paid' && l.status !== 'cancelled' && (
                          <button title={ehPagar ? 'Marcar como pago' : 'Marcar como recebido'} onClick={() => marcarPago(l)} className="text-green-600 hover:text-green-800">
                            <CheckCircle2 size={17} />
                          </button>
                        )}
                        <button title="Editar" onClick={() => abrirEdicao(l)} className="text-slate-400 hover:text-indigo-600">
                          <Pencil size={16} />
                        </button>
                        <button title="Excluir" onClick={() => excluir(l)} className="text-slate-400 hover:text-red-600">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal titulo={form.id ? 'Editar lançamento' : 'Novo lançamento'} aberto={modalAberto} onFechar={() => setModalAberto(false)}>
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Descrição *</label>
              <input required className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {empresas.length > 1 && (
              <div>
                <label className="block text-sm font-medium mb-1">Empresa *</label>
                <select required className={inputCls} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value, account_id: '' })}>
                  <option value="">Selecione…</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Valor (R$) *</label>
              <input required inputMode="decimal" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data de emissão *</label>
              <input type="date" required className={inputCls} value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vencimento *</label>
              <input type="date" required className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data de pagamento</label>
              <input type="date" className={inputCls} value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Categoria</label>
              <select className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Sem categoria</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Conta</label>
              <select className={inputCls} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                <option value="">Sem conta</option>
                {contas.filter((c) => !form.company_id || c.company_id === form.company_id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{ehPagar ? 'Fornecedor' : 'Cliente'}</label>
              <input className={inputCls} value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Observações</label>
              <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <button type="submit" disabled={salvando} className={btnPrimario + ' w-full justify-center'}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
