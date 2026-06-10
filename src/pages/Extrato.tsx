import { useCallback, useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { importarExtratoOFX } from '../lib/importarExtrato'
import { fmtBRL, fmtData } from '../lib/format'
import { corDaCategoria } from '../lib/fatura'
import type { Account, Category, BankTransaction } from '../lib/types'
import { Card, PageHeader, Badge, Vazio, ErroBanner, inputCls, btnPrimario } from '../components/ui'

// Etapa 5 — Extratos (OFX). Port do ImportarOfx.tsx do rb7 pra bank_transactions.
// Conta corrente (cartão vai pelo fluxo de Faturas). Categoria viva (sem tipo,
// mostra todas). Import reporta duplicatas e FITID sintético (follow-up 1c).
export default function Extrato() {
  const { empresaAtiva } = useApp()
  const [contas, setContas] = useState<Account[]>([])
  const [categorias, setCategorias] = useState<Category[]>([])
  const [contaSelecionada, setContaSelecionada] = useState('')
  const [transacoes, setTransacoes] = useState<BankTransaction[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)

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

  const categorizar = async (t: BankTransaction, categoryId: string) => {
    const { error } = await supabase.from('bank_transactions').update({ category_id: categoryId || null }).eq('id', t.id)
    if (error) { setErro('Erro ao categorizar: ' + error.message); return }
    carregarTransacoes()
  }

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
          <label className={btnPrimario + (contaSelecionada ? ' cursor-pointer' : ' opacity-50 cursor-not-allowed')}>
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
        </div>
        {contas.length === 0 && (
          <p className="text-sm text-slate-500 mt-3">
            Cadastre uma conta corrente em <span className="font-medium">Contas &amp; Cartões</span> para importar extratos.
            Faturas de cartão entram pela aba <span className="font-medium">Faturas de Cartão</span>.
          </p>
        )}
        {msg && <p className="text-sm text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mt-4">{msg}</p>}
      </Card>

      <Card>
        {transacoes.length === 0 ? (
          <Vazio mensagem="Nenhuma transação importada para esta conta." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 w-56">Categoria</th>
                </tr>
              </thead>
              <tbody>
                {transacoes.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtData(t.date)}</td>
                    <td className="px-4 py-2.5 text-slate-700">{t.memo ?? '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${Number(t.amount) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtBRL(Number(t.amount))}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.category ? (
                        <div className="flex items-center gap-2">
                          <Badge cor={corDaCategoria(t.category.color_index).text}>{t.category.name}</Badge>
                          <button onClick={() => categorizar(t, '')} className="text-xs text-slate-400 hover:text-red-500">×</button>
                        </div>
                      ) : (
                        <select
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500"
                          value=""
                          onChange={(e) => { if (e.target.value) categorizar(t, e.target.value) }}
                        >
                          <option value="">Categorizar…</option>
                          {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}
                    </td>
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
