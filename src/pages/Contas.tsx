import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil, Landmark, CreditCard, ArrowLeftRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL } from '../lib/format'
import type { Account, AccountType } from '../lib/types'
import { Card, PageHeader, Modal, Vazio, ErroBanner, inputCls, btnPrimario } from '../components/ui'

interface ContaComSaldo extends Account {
  saldo: number
}

const icones: Record<AccountType, typeof Landmark> = {
  checking: Landmark,
  credit_card: CreditCard,
  inter_company: ArrowLeftRight,
}

const rotulos: Record<AccountType, string> = {
  checking: 'Conta corrente',
  credit_card: 'Cartão de crédito',
  inter_company: 'Inter-empresas',
}

export default function Contas() {
  const { empresas, empresaAtiva } = useApp()
  const [contas, setContas] = useState<ContaComSaldo[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState<{
    id?: string; company_id: string; name: string; type: AccountType; bank: string
    initial_balance: string; statement_closing_day: string; due_day: string; active: boolean
  }>({ company_id: '', name: '', type: 'checking', bank: '', initial_balance: '0', statement_closing_day: '', due_day: '', active: true })

  const carregar = useCallback(async () => {
    setErro(null)
    let q = supabase.from('accounts').select('*').order('name')
    if (empresaAtiva) q = q.eq('company_id', empresaAtiva.id)
    const { data: cts, error } = await q
    if (error) { setErro('Erro ao carregar contas: ' + error.message); return }
    if (!cts) { setContas([]); return }

    const ids = cts.map((c) => c.id)
    const { data: ofx } = await supabase
      .from('bank_transactions').select('account_id, amount').in('account_id', ids)
    const { data: lanc } = await supabase
      .from('entries').select('account_id, type, amount').eq('status', 'paid').in('account_id', ids)

    const somaOfx = new Map<string, number>()
    ofx?.forEach((t) => somaOfx.set(t.account_id, (somaOfx.get(t.account_id) ?? 0) + Number(t.amount)))
    const somaLanc = new Map<string, number>()
    lanc?.forEach((l) => {
      const v = l.type === 'payable' ? -Number(l.amount) : Number(l.amount)
      somaLanc.set(l.account_id, (somaLanc.get(l.account_id) ?? 0) + v)
    })

    setContas(
      cts.map((c: Account) => ({
        ...c,
        // conta corrente: se há OFX importado, ele é a fonte da verdade; senão lançamentos.
        // cartão/inter-empresa: NUNCA usa a regra do OFX (fatura não passa por bank_transactions)
        saldo:
          Number(c.initial_balance) +
          (c.type === 'checking' && somaOfx.has(c.id)
            ? somaOfx.get(c.id)!
            : somaLanc.get(c.id) ?? 0),
      }))
    )
  }, [empresaAtiva])

  useEffect(() => { carregar() }, [carregar])

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null)
    const payload = {
      company_id: form.company_id,
      name: form.name,
      type: form.type,
      bank: form.bank || null,
      initial_balance: parseFloat(form.initial_balance.replace(',', '.')) || 0,
      statement_closing_day: form.statement_closing_day ? parseInt(form.statement_closing_day) : null,
      due_day: form.due_day ? parseInt(form.due_day) : null,
      active: form.active,
    }
    const { error } = form.id
      ? await supabase.from('accounts').update(payload).eq('id', form.id)
      : await supabase.from('accounts').insert(payload)
    if (error) { setErro('Erro ao salvar conta: ' + error.message); return }
    setModalAberto(false)
    carregar()
  }

  const nomeEmpresa = (id: string) => empresas.find((e) => e.id === id)?.name ?? ''

  return (
    <div>
      <PageHeader
        titulo="Contas & Cartões"
        subtitulo="Contas bancárias, cartões de crédito e empréstimos inter-empresas"
        acao={
          <button onClick={() => { setForm({ company_id: empresaAtiva?.id ?? empresas[0]?.id ?? '', name: '', type: 'checking', bank: '', initial_balance: '0', statement_closing_day: '', due_day: '', active: true }); setModalAberto(true) }} className={btnPrimario}>
            <Plus size={16} /> Nova conta
          </button>
        }
      />

      <ErroBanner mensagem={erro} />

      {contas.length === 0 ? (
        <Card><Vazio mensagem="Nenhuma conta cadastrada." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {contas.map((c) => {
            const Icone = icones[c.type]
            return (
              <Card key={c.id} className={`p-5 ${!c.active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                      <Icone size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-400">
                        {nomeEmpresa(c.company_id)} · {rotulos[c.type]}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setForm({ id: c.id, company_id: c.company_id, name: c.name, type: c.type, bank: c.bank ?? '', initial_balance: String(c.initial_balance), statement_closing_day: c.statement_closing_day ? String(c.statement_closing_day) : '', due_day: c.due_day ? String(c.due_day) : '', active: c.active }); setModalAberto(true) }}
                    className="text-slate-300 hover:text-indigo-600"
                  >
                    <Pencil size={15} />
                  </button>
                </div>
                <p className={`text-2xl font-bold mt-4 ${c.saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {fmtBRL(c.saldo)}
                </p>
                {c.type === 'inter_company' && (
                  <p className="text-xs text-slate-400 mt-1">
                    Saldo do empréstimo entre empresas (consultável)
                  </p>
                )}
                {c.type === 'credit_card' && (
                  <p className="text-xs text-slate-400 mt-1">
                    {c.statement_closing_day || c.due_day
                      ? `Fecha dia ${c.statement_closing_day ?? '—'} · vence dia ${c.due_day ?? '—'}`
                      : 'Fechamento/vencimento não cadastrados'}
                  </p>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal titulo={form.id ? 'Editar conta' : 'Nova conta'} aberto={modalAberto} onFechar={() => setModalAberto(false)}>
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome *</label>
            <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Empresa *</label>
              <select required className={inputCls} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">Selecione…</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}>
                <option value="checking">Conta corrente</option>
                <option value="credit_card">Cartão de crédito</option>
                <option value="inter_company">Inter-empresas</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Banco</label>
              <input className={inputCls} value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Saldo inicial (R$)</label>
              <input inputMode="decimal" className={inputCls} value={form.initial_balance} onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} />
            </div>
            {form.type === 'credit_card' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Dia de fechamento</label>
                  <input type="number" min={1} max={31} className={inputCls} value={form.statement_closing_day} onChange={(e) => setForm({ ...form, statement_closing_day: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Dia de vencimento</label>
                  <input type="number" min={1} max={31} className={inputCls} value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} />
                </div>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Ativa
          </label>
          <button type="submit" className={btnPrimario + ' w-full justify-center'}>Salvar</button>
        </form>
      </Modal>
    </div>
  )
}
