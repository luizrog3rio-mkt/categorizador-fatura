import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Pencil, Landmark, Wallet, CreditCard, ArrowLeftRight, Receipt } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, fmtData, primeiroDiaMes, ultimoDiaMes } from '../lib/format'
import type { Account, AccountType, AccountBalance, AccountLedgerRow } from '../lib/types'
import { Card, PageHeader, Modal, Vazio, ErroBanner, Badge, inputCls, btnPrimario, type BadgeTom } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'

interface ContaComSaldo extends Account {
  saldo: number
  fonte: 'ofx' | 'entries' | 'inicial'
}

const FONTE_LABEL: Record<ContaComSaldo['fonte'], { txt: string; tom: BadgeTom }> = {
  ofx: { txt: 'Extrato', tom: 'brand' },
  entries: { txt: 'Lançamentos', tom: 'muted' },
  inicial: { txt: 'Só saldo inicial', tom: 'warning' },
}

const icones: Record<AccountType, typeof Landmark> = {
  checking: Landmark,
  cash: Wallet,
  credit_card: CreditCard,
  inter_company: ArrowLeftRight,
}

const rotulos: Record<AccountType, string> = {
  checking: 'Conta corrente',
  cash: 'Conta caixa',
  credit_card: 'Cartão de crédito',
  inter_company: 'Inter-empresas',
}

export default function Contas() {
  const { empresas, empresaAtiva, isAdmin } = useApp()
  const [contas, setContas] = useState<ContaComSaldo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState<{
    id?: string; company_id: string; name: string; type: AccountType; bank: string
    initial_balance: string; statement_closing_day: string; due_day: string; active: boolean
  }>({ company_id: '', name: '', type: 'checking', bank: '', initial_balance: '0', statement_closing_day: '', due_day: '', active: true })

  const carregar = useCallback(async () => {
    setErro(null)
    let q = supabase.from('accounts').select('*').order('name')
    // empresa: filtro local da tela tem precedência sobre o escopo global
    const escopoEmpresa = filtroEmpresa || empresaAtiva?.id
    if (escopoEmpresa) q = q.eq('company_id', escopoEmpresa)
    const { data: cts, error } = await q
    if (error) { setErro('Erro ao carregar contas: ' + error.message); setCarregando(false); return }
    if (!cts) { setContas([]); setCarregando(false); return }

    // saldo vem do banco (RPC) — a regra OFX-XOR-lançamentos-pagos roda lá dentro,
    // sem o bug do .in() que truncava em 1000 linhas no cliente.
    const { data: bal, error: eBal } = await supabase.rpc('account_balances', { p_company: escopoEmpresa ?? null })
    if (eBal) setErro('Erro ao calcular saldos (mostrando só o saldo inicial): ' + eBal.message)
    const saldos = new Map<string, { saldo: number; fonte: ContaComSaldo['fonte'] }>()
    ;(bal as AccountBalance[] | null)?.forEach((b) => saldos.set(b.account_id, { saldo: Number(b.saldo), fonte: b.fonte }))

    setContas(
      cts.map((c: Account) => ({
        ...c,
        saldo: saldos.get(c.id)?.saldo ?? Number(c.initial_balance),
        fonte: saldos.get(c.id)?.fonte ?? 'inicial',
      }))
    )
    setCarregando(false)
  }, [empresaAtiva, filtroEmpresa])

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

  const contasFiltradas = useMemo(() => contas.filter((c) => {
    if (filtroTipo && c.type !== filtroTipo) return false
    if (filtroAtivo === 'ativas' && !c.active) return false
    if (filtroAtivo === 'inativas' && c.active) return false
    return true
  }), [contas, filtroTipo, filtroAtivo])

  // se o filtro de empresa coincide com o escopo global, trata como "sem filtro"
  // (a empresa ativa é omitida das opções — evita o select renderizar em branco)
  const filtroEmpresaVisivel = filtroEmpresa && filtroEmpresa !== empresaAtiva?.id ? filtroEmpresa : ''
  const temFiltro = !!(filtroTipo || filtroAtivo || filtroEmpresaVisivel)
  const limparFiltros = () => { setFiltroTipo(''); setFiltroAtivo(''); setFiltroEmpresa('') }

  // ── extrato por conta (Modal com saldo acumulado) ──────────────────────────
  const [ledgerConta, setLedgerConta] = useState<ContaComSaldo | null>(null)
  const [ledgerDe, setLedgerDe] = useState(primeiroDiaMes())
  const [ledgerAte, setLedgerAte] = useState(ultimoDiaMes())
  const [ledger, setLedger] = useState<AccountLedgerRow[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  // busca imperativa (não via effect) pra não somar warning de set-state-in-effect
  const carregarLedger = useCallback(async (conta: ContaComSaldo, de: string, ate: string) => {
    setLedgerLoading(true)
    const { data, error } = await supabase.rpc('account_ledger', { p_account: conta.id, p_start: de || null, p_end: ate || null })
    if (error) setErro('Erro ao carregar extrato: ' + error.message)
    setLedger(((data as AccountLedgerRow[] | null) ?? []).map((r) => ({ ...r, amount: Number(r.amount), saldo_acumulado: Number(r.saldo_acumulado) })))
    setLedgerLoading(false)
  }, [])

  const abrirExtrato = (c: ContaComSaldo) => {
    const de = primeiroDiaMes(), ate = ultimoDiaMes()
    setLedgerConta(c); setLedgerDe(de); setLedgerAte(ate); setLedger([])
    carregarLedger(c, de, ate)
  }
  const mudarPeriodo = (de: string, ate: string) => {
    setLedgerDe(de); setLedgerAte(ate)
    if (ledgerConta) carregarLedger(ledgerConta, de, ate)
  }

  const ledgerCols = useMemo<DataColumn<AccountLedgerRow>[]>(() => [
    { id: 'data', header: 'Data', size: 110, cell: (r) => <span className="text-fg-muted whitespace-nowrap">{fmtData(r.data)}</span> },
    { id: 'descricao', header: 'Descrição', size: 340, cell: (r) => <span className="text-fg-muted">{r.descricao || '—'}</span> },
    { id: 'amount', header: 'Valor', size: 130, align: 'right',
      cell: (r) => <span className={`font-medium tnum ${r.amount < 0 ? 'text-expense' : 'text-revenue'}`}>{fmtBRL(r.amount)}</span> },
    { id: 'saldo', header: 'Saldo acumulado', size: 160, align: 'right',
      cell: (r) => <span className="font-semibold tnum text-fg">{fmtBRL(r.saldo_acumulado)}</span>,
      footer: ledger.length ? <span className="font-bold text-fg">{fmtBRL(ledger[ledger.length - 1].saldo_acumulado)}</span> : undefined },
  ], [ledger])

  return (
    <div>
      <PageHeader
        titulo="Contas & Cartões"
        subtitulo="Contas bancárias, cartões de crédito e empréstimos inter-empresas"
        acao={
          <button onClick={() => { setForm({ company_id: empresaAtiva?.id ?? empresas[0]?.id ?? '', name: '', type: 'checking', bank: '', initial_balance: '0', statement_closing_day: '', due_day: '', active: true }); setModalAberto(true) }} disabled={!isAdmin} className={btnPrimario}>
            <Plus size={16} /> Nova conta
          </button>
        }
      />

      <ErroBanner mensagem={erro} />

      {contas.length > 0 && (
        <Card className="p-4 mb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-48">
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select className={inputCls} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                <option value="">Todos os tipos</option>
                <option value="checking">Conta corrente</option>
                <option value="cash">Conta caixa</option>
                <option value="credit_card">Cartão de crédito</option>
                <option value="inter_company">Inter-empresas</option>
              </select>
            </div>
            <div className="w-44">
              <label className="block text-sm font-medium mb-1">Situação</label>
              <select className={inputCls} value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value)}>
                <option value="">Todas</option>
                <option value="ativas">Ativas</option>
                <option value="inativas">Inativas</option>
              </select>
            </div>
            {empresas.length > 1 && (
              <div className="w-48">
                <label className="block text-sm font-medium mb-1">Empresa</label>
                <select className={inputCls} value={filtroEmpresaVisivel} onChange={(e) => setFiltroEmpresa(e.target.value)}>
                  <option value="">{empresaAtiva ? `Apenas ${empresaAtiva.name}` : 'Todas as empresas'}</option>
                  {empresas.filter((e) => e.id !== empresaAtiva?.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}
            {temFiltro && (
              <button type="button" onClick={limparFiltros} className="text-sm text-fg-muted hover:text-brand underline pb-2">
                Limpar filtros
              </button>
            )}
          </div>
        </Card>
      )}

      {contasFiltradas.length === 0 ? (
        <Card><Vazio mensagem={carregando ? 'Carregando…' : contas.length === 0 ? 'Nenhuma conta cadastrada.' : 'Nenhuma conta com esses filtros.'} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {contasFiltradas.map((c) => {
            const Icone = icones[c.type]
            return (
              <Card key={c.id} className={`p-5 ${!c.active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-control bg-brand-subtle text-brand">
                      <Icone size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-fg">{c.name}</p>
                      <p className="text-xs text-fg-subtle">
                        {nomeEmpresa(c.company_id)} · {rotulos[c.type]}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                  <button
                    onClick={() => { setForm({ id: c.id, company_id: c.company_id, name: c.name, type: c.type, bank: c.bank ?? '', initial_balance: String(c.initial_balance), statement_closing_day: c.statement_closing_day ? String(c.statement_closing_day) : '', due_day: c.due_day ? String(c.due_day) : '', active: c.active }); setModalAberto(true) }}
                    className="text-fg-subtle hover:text-brand"
                  >
                    <Pencil size={15} />
                  </button>
                  )}
                </div>
                <p className={`text-2xl font-bold mt-4 tnum ${c.saldo < 0 ? 'text-expense' : 'text-revenue'}`}>
                  {fmtBRL(c.saldo)}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <Badge tom={FONTE_LABEL[c.fonte].tom}>{FONTE_LABEL[c.fonte].txt}</Badge>
                  <button onClick={() => abrirExtrato(c)} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-strong">
                    <Receipt size={13} /> Ver extrato
                  </button>
                </div>
                {c.type === 'inter_company' && (
                  <p className="text-xs text-fg-subtle mt-1">
                    Saldo do empréstimo entre empresas (consultável)
                  </p>
                )}
                {c.type === 'credit_card' && (
                  <p className="text-xs text-fg-subtle mt-1">
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
                <option value="cash">Conta caixa</option>
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

      {/* Modal: extrato da conta com saldo acumulado */}
      <Modal titulo={`Extrato — ${ledgerConta?.name ?? ''}`} aberto={!!ledgerConta} onFechar={() => setLedgerConta(null)} largura="4xl">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">De</label>
            <input type="date" className={inputCls} value={ledgerDe} onChange={(e) => mudarPeriodo(e.target.value, ledgerAte)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Até</label>
            <input type="date" className={inputCls} value={ledgerAte} onChange={(e) => mudarPeriodo(ledgerDe, e.target.value)} />
          </div>
          {ledgerConta && (
            <div className="ml-auto text-right">
              <p className="text-xs text-fg-subtle uppercase">Saldo atual</p>
              <p className={`text-lg font-bold tnum ${ledgerConta.saldo < 0 ? 'text-expense' : 'text-revenue'}`}>{fmtBRL(ledgerConta.saldo)}</p>
            </div>
          )}
        </div>
        {ledgerLoading ? (
          <Vazio mensagem="Carregando…" />
        ) : ledger.length === 0 ? (
          <Vazio mensagem={ledgerConta?.fonte === 'inicial' ? 'Sem movimentações — só o saldo inicial. Importe um OFX (Extratos) ou marque lançamentos como pagos com esta conta.' : 'Nenhuma movimentação no período.'} />
        ) : (
          <DataTable tableKey="account-ledger" columns={ledgerCols} data={ledger} getRowId={(r) => r.origem_id} />
        )}
      </Modal>
    </div>
  )
}
