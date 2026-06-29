import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { fmtBRL, fmtData } from '../lib/format'
import type { Entry } from '../lib/types'
import { Card, PageHeader, Vazio, ErroBanner, inputCls } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'
import DateRangePicker from '../components/DateRangePicker'

// Tela read-only das transferências entre contas. Uma transferência é um PAR de
// lançamentos amarrados por entries.transfer_id (saída payable na origem +
// entrada receivable no destino, ambas pagas e sem conta DRE). Aqui colapsamos o
// par em UMA linha. Criar é pelo botão "Transferência" em Contas a Pagar/Receber
// (as pernas seguem aparecendo lá com o selo — decisão de 2026-06-25).

interface TransferLinha {
  transfer_id: string
  data: string // due_date/payment_date — as duas pernas compartilham
  amount: number
  description: string
  origemConta: string | null
  origemEmpresa: string | null // company_id da perna de saída
  destinoConta: string | null
  destinoEmpresa: string | null // company_id da perna de entrada
}

export default function Transferencias() {
  const { empresas, empresaAtiva, isAdmin } = useApp()
  const [entries, setEntries] = useState<Entry[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')

  // 1 fetch no mount; SEM filtrar company_id (quebraria pares entre empresas).
  // O hint accounts!account_id é obrigatório (entries tem 2 FKs p/ accounts).
  const carregar = useCallback(async () => {
    setErro(null)
    const { data, error } = await supabase
      .from('entries')
      .select('*, account:accounts!account_id(*)')
      .not('transfer_id', 'is', null)
      .order('due_date', { ascending: false })
    if (error) setErro('Erro ao carregar transferências: ' + error.message)
    else setEntries((data as Entry[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // colapsa as 2 pernas (payable=origem, receivable=destino) em 1 linha por transfer_id
  const transferencias = useMemo<TransferLinha[]>(() => {
    const map = new Map<string, { payable?: Entry; receivable?: Entry }>()
    for (const e of entries) {
      if (!e.transfer_id) continue
      const g = map.get(e.transfer_id) ?? {}
      if (e.type === 'payable') g.payable = e
      else g.receivable = e
      map.set(e.transfer_id, g)
    }
    return [...map.entries()]
      .map(([transfer_id, g]) => {
        const ref = g.payable ?? g.receivable! // defensivo: 1 perna basta p/ data/valor/desc
        return {
          transfer_id,
          data: ref.payment_date ?? ref.due_date,
          amount: Number(ref.amount),
          description: ref.description,
          origemConta: g.payable?.account?.name ?? null,
          origemEmpresa: g.payable?.company_id ?? null,
          destinoConta: g.receivable?.account?.name ?? null,
          destinoEmpresa: g.receivable?.company_id ?? null,
        }
      })
      .sort((a, b) => b.data.localeCompare(a.data) || a.transfer_id.localeCompare(b.transfer_id))
  }, [entries])

  // filtro de empresa: o local tem precedência sobre o escopo global (empresaAtiva)
  const filtroEmpresaVisivel = filtroEmpresa && filtroEmpresa !== empresaAtiva?.id ? filtroEmpresa : ''
  const temFiltro = !!(dataDe || dataAte || filtroEmpresaVisivel)
  const limparFiltros = () => { setDataDe(''); setDataAte(''); setFiltroEmpresa('') }

  // empresa = QUALQUER perna na empresa do escopo (não quebra o par); período por string
  const visiveis = useMemo(() => {
    const escopo = filtroEmpresa || empresaAtiva?.id
    return transferencias.filter((t) => {
      const noEscopo = !escopo || t.origemEmpresa === escopo || t.destinoEmpresa === escopo
      const noPeriodo = (!dataDe || t.data >= dataDe) && (!dataAte || t.data <= dataAte)
      return noEscopo && noPeriodo
    })
  }, [transferencias, filtroEmpresa, empresaAtiva, dataDe, dataAte])

  const totalValor = useMemo(() => visiveis.reduce((s, t) => s + t.amount, 0), [visiveis])

  const excluir = useCallback(async (t: TransferLinha) => {
    if (!window.confirm('Excluir esta transferência? As duas pernas (saída e entrada) serão removidas.')) return
    const { error } = await supabase.from('entries').delete().eq('transfer_id', t.transfer_id)
    if (error) { setErro('Erro ao excluir transferência: ' + error.message); return }
    carregar()
  }, [carregar])

  const multiEmpresa = empresas.length > 1

  const colunas = useMemo<DataColumn<TransferLinha>[]>(() => {
    const cols: DataColumn<TransferLinha>[] = [
      { id: 'data', header: 'Data', size: 110, cell: (t) => <span className="text-fg-muted tnum whitespace-nowrap">{fmtData(t.data)}</span>, footer: 'Total' },
      { id: 'origem', header: 'Origem', size: 200, cell: (t) => (
        <div>
          <p className="font-medium text-fg">{t.origemConta ?? '—'}</p>
          {multiEmpresa && <p className="text-xs text-fg-subtle">{empresas.find((e) => e.id === t.origemEmpresa)?.name ?? '—'}</p>}
        </div>
      ) },
      { id: 'seta', header: '', label: '→', size: 40, align: 'center', enableHiding: false, cell: () => <ArrowLeftRight size={14} className="text-fg-subtle mx-auto" /> },
      { id: 'destino', header: 'Destino', size: 200, cell: (t) => (
        <div>
          <p className="font-medium text-fg">{t.destinoConta ?? '—'}</p>
          {multiEmpresa && <p className="text-xs text-fg-subtle">{empresas.find((e) => e.id === t.destinoEmpresa)?.name ?? '—'}</p>}
        </div>
      ) },
      { id: 'amount', header: 'Valor', size: 130, align: 'right', cell: (t) => <span className="font-semibold tnum">{fmtBRL(t.amount)}</span>, footer: fmtBRL(totalValor) },
      { id: 'description', header: 'Descrição', size: 240, grow: true, cell: (t) => <span className="text-fg-muted">{t.description}</span> },
    ]
    if (isAdmin) {
      cols.push({ id: 'acoes', header: '', label: 'Ações', size: 64, align: 'right', enableHiding: false, cell: (t) => (
        <button title="Excluir transferência" onClick={() => excluir(t)} className="text-fg-subtle hover:text-expense">
          <Trash2 size={16} />
        </button>
      ) })
    }
    return cols
  }, [isAdmin, multiEmpresa, empresas, totalValor, excluir])

  return (
    <div>
      <PageHeader
        titulo="Transferências"
        subtitulo="Movimentações entre contas — saída na origem, entrada no destino (neutras na DRE)"
      />

      <ErroBanner mensagem={erro} />

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Período</label>
            <DateRangePicker de={dataDe} ate={dataAte} onChange={(d, a) => { setDataDe(d); setDataAte(a) }} />
          </div>
          {empresas.length > 1 && (
            <div className="w-56">
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

      <Card>
        {visiveis.length === 0 ? (
          <Vazio mensagem={carregando ? 'Carregando…' : temFiltro ? 'Nenhuma transferência para esse filtro.' : 'Nenhuma transferência registrada ainda. Crie uma em Contas a Pagar/Receber → botão "Transferência".'} />
        ) : (
          <DataTable tableKey="transferencias" columns={colunas} data={visiveis} getRowId={(t) => t.transfer_id} />
        )}
      </Card>
    </div>
  )
}
