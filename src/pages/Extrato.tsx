import { useCallback, useEffect, useMemo, useState } from 'react'
import { Upload, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { importarExtratoOFX } from '../lib/importarExtrato'
import { fmtBRL, fmtData } from '../lib/format'
import { corDaCategoria } from '../lib/fatura'
import type { Account, Category, BankTransaction } from '../lib/types'
import { Card, PageHeader, Badge, Vazio, ErroBanner, Modal, Alert, Button, inputCls, btnPrimario, btnSecundario } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'

// Etapa 5 — Extratos (OFX). Port do ImportarOfx.tsx do rb7 pra bank_transactions.
// Conta corrente (cartão vai pelo fluxo de Faturas). Categoria viva (sem tipo,
// mostra todas). Import reporta duplicatas e FITID sintético (follow-up 1c).
export default function Extrato() {
  const { empresaAtiva, isAdmin } = useApp()
  const [contas, setContas] = useState<Account[]>([])
  const [categorias, setCategorias] = useState<Category[]>([])
  const [contaSelecionada, setContaSelecionada] = useState('')
  const [transacoes, setTransacoes] = useState<BankTransaction[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [confirmarLimpar, setConfirmarLimpar] = useState(false)
  const [limpando, setLimpando] = useState(false)
  const [qtdParaLimpar, setQtdParaLimpar] = useState<number | null>(null)
  const [conciliadasParaLimpar, setConciliadasParaLimpar] = useState(0)

  useEffect(() => {
    // extrato = conta corrente (cartão tem o fluxo de Faturas; inter-empresa não importa OFX)
    let q = supabase.from('accounts').select('*').eq('active', true).eq('type', 'checking').order('name')
    if (empresaAtiva) q = q.eq('company_id', empresaAtiva.id)
    q.then(({ data }) => {
      setContas(data ?? [])
      setContaSelecionada((prev) => (data?.find((c) => c.id === prev) ? prev : data?.[0]?.id ?? ''))
    })
    supabase.from('categories').select('*').order('name').then(({ data }) => setCategorias(data ?? []))
  }, [empresaAtiva])

  const carregarTransacoes = useCallback(async () => {
    if (!contaSelecionada) { setTransacoes([]); return }
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*, category:categories(*)')
      .eq('account_id', contaSelecionada)
      .order('date', { ascending: false })
      .limit(300)
    if (error) { setErro('Erro ao carregar transações: ' + error.message); return }
    setTransacoes((data as BankTransaction[]) ?? [])
  }, [contaSelecionada])

  useEffect(() => { carregarTransacoes() }, [carregarTransacoes])

  const importar = async (file: File) => {
    if (!contaSelecionada) { setMsg('Selecione a conta antes de importar.'); return }
    setImportando(true)
    setMsg(null)
    setErro(null)
    const { ok, erro: e } = await importarExtratoOFX(file, contaSelecionada)
    setImportando(false)
    if (e) { setMsg(e); return }
    if (ok) setMsg(ok.msg)
    carregarTransacoes()
  }

  const abrirLimpar = useCallback(async () => {
    if (!contaSelecionada) return
    setErro(null)
    const { count } = await supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', contaSelecionada)
    const { count: conc } = await supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', contaSelecionada)
      .not('entry_id', 'is', null)
    setQtdParaLimpar(count ?? 0)
    setConciliadasParaLimpar(conc ?? 0)
    setConfirmarLimpar(true)
  }, [contaSelecionada])

  const limpar = async () => {
    if (!contaSelecionada) return
    setLimpando(true)
    setErro(null)
    const { error, count } = await supabase
      .from('bank_transactions')
      .delete({ count: 'exact' })
      .eq('account_id', contaSelecionada)
    setLimpando(false)
    setConfirmarLimpar(false)
    if (error) { setErro('Erro ao limpar transações: ' + error.message); return }
    setMsg(`${count ?? 0} transação(ões) removida(s).`)
    carregarTransacoes()
  }

  const categorizar = useCallback(async (t: BankTransaction, categoryId: string) => {
    const { error } = await supabase.from('bank_transactions').update({ category_id: categoryId || null }).eq('id', t.id)
    if (error) { setErro('Erro ao categorizar: ' + error.message); return }
    carregarTransacoes()
  }, [carregarTransacoes])

  const colunas = useMemo<DataColumn<BankTransaction>[]>(() => [
    { id: 'date', header: 'Data', size: 110, cell: (t) => <span className="text-fg-muted whitespace-nowrap">{fmtData(t.date)}</span> },
    { id: 'memo', header: 'Descrição', size: 360, cell: (t) => <span className="text-fg-muted">{t.memo ?? '—'}</span> },
    { id: 'amount', header: 'Valor', size: 130, align: 'right', cell: (t) => (
      <span className={`font-semibold whitespace-nowrap tnum ${Number(t.amount) < 0 ? 'text-expense' : 'text-revenue'}`}>{fmtBRL(Number(t.amount))}</span>
    ) },
    { id: 'category', header: 'Categoria', size: 220, cell: (t) => (
      t.category ? (
        <div className="flex items-center gap-2">
          <Badge cor={corDaCategoria(t.category.color_index).text}>{t.category.name}</Badge>
          {isAdmin && <button onClick={() => categorizar(t, '')} className="text-xs text-fg-subtle hover:text-expense">×</button>}
        </div>
      ) : isAdmin ? (
        <select
          className="w-full rounded-control border border-border px-2 py-1 text-xs text-fg-muted"
          value=""
          onChange={(e) => { if (e.target.value) categorizar(t, e.target.value) }}
        >
          <option value="">Categorizar…</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ) : null
    ) },
  ], [isAdmin, categorias, categorizar])

  return (
    <div>
      <PageHeader
        titulo="Extratos (OFX)"
        subtitulo="Importe extratos de conta corrente — conciliação bancária, fim da digitação manual"
      />

      <ErroBanner mensagem={erro} />

      <Card className="p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-56">
            <label className="block text-sm font-medium mb-1">Conta de destino</label>
            <select className={inputCls} value={contaSelecionada} onChange={(e) => setContaSelecionada(e.target.value)}>
              {contas.length === 0 && <option value="">Nenhuma conta corrente cadastrada</option>}
              {contas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <label className={btnPrimario + (!isAdmin ? ' opacity-50 pointer-events-none' : contaSelecionada ? ' cursor-pointer' : ' opacity-50 cursor-not-allowed')}>
            <Upload size={16} />
            {importando ? 'Importando…' : 'Importar arquivo OFX'}
            <input
              type="file"
              accept=".ofx,.OFX,.qfx"
              className="hidden"
              disabled={importando || !contaSelecionada}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }}
            />
          </label>
          {isAdmin && (
            <button
              type="button"
              onClick={abrirLimpar}
              disabled={!contaSelecionada || transacoes.length === 0 || importando}
              className="inline-flex items-center gap-2 bg-surface border border-border hover:bg-expense-bg text-expense text-sm font-medium rounded-control px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={16} />
              Limpar transações
            </button>
          )}
        </div>
        {contas.length === 0 && (
          <p className="text-sm text-fg-muted mt-3">
            Cadastre uma conta corrente em <span className="font-medium">Contas &amp; Cartões</span> para importar extratos.
            Faturas de cartão entram pela aba <span className="font-medium">Faturas de Cartão</span>.
          </p>
        )}
        {msg && <div className="mt-4"><Alert tom="info">{msg}</Alert></div>}
      </Card>

      <Card>
        {transacoes.length === 0 ? (
          <Vazio mensagem="Nenhuma transação importada para esta conta." />
        ) : (
          <DataTable
            tableKey="extrato-ofx"
            columns={colunas}
            data={transacoes}
            getRowId={(t) => t.id}
          />
        )}
      </Card>

      <Modal titulo="Limpar transações" aberto={confirmarLimpar} onFechar={() => setConfirmarLimpar(false)}>
        <p className="text-sm text-fg-muted">
          Isso vai apagar <strong>{qtdParaLimpar ?? 0}</strong> transação(ões) da conta{' '}
          <strong>{contas.find((c) => c.id === contaSelecionada)?.name ?? '—'}</strong>. Esta ação não pode ser desfeita.
        </p>
        {conciliadasParaLimpar > 0 && (
          <div className="mt-3">
            <Alert tom="warning">
              ⚠️ {conciliadasParaLimpar} dessas transações estão conciliadas com lançamentos. Apagá-las desfaz a conciliação.
            </Alert>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className={btnSecundario} onClick={() => setConfirmarLimpar(false)} disabled={limpando}>
            Cancelar
          </button>
          <Button variante="danger" onClick={limpar} disabled={limpando}>
            <Trash2 size={16} />
            {limpando ? 'Limpando…' : 'Apagar tudo'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
