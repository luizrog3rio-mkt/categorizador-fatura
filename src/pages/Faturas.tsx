import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Trash2, FileText, CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { useFaturaWorld } from '../hooks/useFaturaWorld'
import { importarFaturaOFX } from '../lib/importarFatura'
import { fmt } from '../lib/fatura'
import { PageHeader, ErroBanner, Modal, btnPrimario, inputCls } from '../components/ui'
import type { Account, Invoice } from '../lib/types'

// Lista de faturas — padronizada no design system do app (PageHeader + Card +
// botões/Modal compartilhados). Comportamento preservado do port: import grava
// account_id (cartão selecionável quando houver mais de um), erros em banner,
// exclusão com o window.confirm de texto exato (contrato #8).
export default function Faturas() {
  const { session, isAdmin } = useApp()
  const { regras, erro: erroWorld } = useFaturaWorld()
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [importando, setImportando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [cartoes, setCartoes] = useState<Account[]>([])
  const [arquivoPendente, setArquivoPendente] = useState<File | null>(null)
  const [cartaoEscolhido, setCartaoEscolhido] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('imported_at', { ascending: false })
    if (error) setErro('Erro ao carregar faturas: ' + error.message)
    setInvoices(data ?? [])
    const { data: accts } = await supabase
      .from('accounts')
      .select('*')
      .eq('type', 'credit_card')
      .eq('active', true)
      .order('name')
    setCartoes(accts ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const doImport = async (file: File, accountId: string | null) => {
    if (!session) return
    setImportando(true)
    setErro(null)
    const { ok, erro: e } = await importarFaturaOFX(file, regras, session.user.id, accountId)
    setImportando(false)
    if (e) { setErro(e); return }
    if (ok) {
      navigate(`/faturas/${ok.invoice.id}`, { state: { pendentes: ok.pendentes } })
    }
  }

  const onNovoArquivo = (file: File | undefined | null) => {
    if (!file) return
    if (cartoes.length > 1) {
      setArquivoPendente(file)
      setCartaoEscolhido(cartoes[0]?.id ?? '')
    } else {
      doImport(file, cartoes[0]?.id ?? null)
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  // contrato #8: confirm com este texto exato antes de excluir fatura
  const excluir = async (inv: Invoice) => {
    if (!window.confirm(`Excluir a fatura "${inv.name ?? ''}" e todas as suas transações? Essa ação não tem desfazer.`)) return
    const { error } = await supabase.from('invoices').delete().eq('id', inv.id)
    if (error) { setErro('Erro ao excluir fatura: ' + error.message); return }
    setInvoices((prev) => prev.filter((i) => i.id !== inv.id))
  }

  return (
    <div>
      <PageHeader
        titulo="Faturas de Cartão"
        subtitulo={
          invoices.length === 0
            ? 'Nenhuma fatura importada ainda'
            : `${invoices.length} fatura${invoices.length !== 1 ? 's' : ''} importada${invoices.length !== 1 ? 's' : ''}`
        }
        acao={
          <label className={btnPrimario + (!isAdmin ? ' opacity-40 pointer-events-none' : importando ? ' opacity-60 pointer-events-none' : ' cursor-pointer')}>
            <Upload size={16} />
            {importando ? 'Importando…' : 'Importar .OFX'}
            <input ref={fileInput} type="file" accept=".ofx" className="hidden" disabled={importando}
              onChange={(e) => onNovoArquivo(e.target.files?.[0])} />
          </label>
        }
      />

      <ErroBanner mensagem={erro ?? erroWorld} />

      {loading && <div className="text-center py-10 text-fg-subtle text-sm">Carregando...</div>}

      {!loading && invoices.length === 0 && (
        <div className="bg-surface border-2 border-dashed border-border rounded-modal py-16 px-6 text-center">
          <div className="flex justify-center mb-3 text-fg-subtle"><CreditCard size={48} /></div>
          <p className="text-base font-bold text-fg mb-1">Importe sua primeira fatura</p>
          <p className="text-sm text-fg-muted">Clique em “Importar .OFX” no topo da página</p>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {invoices.map((inv) => {
          const cartao = inv.account_id ? cartoes.find((c) => c.id === inv.account_id) : null
          return (
            <div
              key={inv.id}
              onClick={() => navigate(`/faturas/${inv.id}`)}
              className="bg-surface rounded-card border border-border shadow-card px-5 py-4 flex items-center gap-4 cursor-pointer transition hover:border-brand-subtle hover:shadow-pop"
            >
              <div className="w-11 h-11 rounded-control bg-brand-subtle flex items-center justify-center text-brand shrink-0">
                <FileText size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-fg truncate">{inv.name || 'Fatura importada'}</div>
                <div className="text-xs text-fg-subtle">
                  {inv.transaction_count} lançamentos · {inv.imported_at ? new Date(inv.imported_at).toLocaleDateString('pt-BR') : '—'}
                  {cartao ? ` · ${cartao.name}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0 font-extrabold text-base text-fg tnum">{fmt(Number(inv.total ?? 0))}</div>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); excluir(inv) }}
                  className="text-fg-subtle hover:text-expense p-1.5 rounded-control transition shrink-0"
                  title="Excluir fatura"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <Modal titulo="De qual cartão é esta fatura?" aberto={arquivoPendente !== null} onFechar={() => setArquivoPendente(null)}>
        <div className="space-y-4">
          <select className={inputCls} value={cartaoEscolhido} onChange={(e) => setCartaoEscolhido(e.target.value)}>
            {cartoes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            className={btnPrimario + ' w-full justify-center'}
            onClick={() => { const f = arquivoPendente; setArquivoPendente(null); if (f) doImport(f, cartaoEscolhido || null) }}
          >
            Importar
          </button>
        </div>
      </Modal>
    </div>
  )
}
