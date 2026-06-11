import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { useFaturaWorld } from '../hooks/useFaturaWorld'
import { importarFaturaOFX } from '../lib/importarFatura'
import { fmt } from '../lib/fatura'
import { ErroBanner, Modal, btnPrimario, inputCls } from '../components/ui'
import type { Account, Invoice } from '../lib/types'

// Lista de faturas — port do InvoiceHistory do App.jsx, dentro do shell novo.
// Evoluções conscientes: import grava account_id (cartão selecionável quando
// houver mais de um), erros aparecem em banner.
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
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <ErroBanner mensagem={erro ?? erroWorld} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Suas faturas</h2>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            {invoices.length === 0 ? 'Nenhuma fatura importada ainda' : `${invoices.length} fatura${invoices.length !== 1 ? 's' : ''} importada${invoices.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#3b82f6', color: '#fff', padding: '10px 20px',
            borderRadius: 10, cursor: !isAdmin ? 'default' : importando ? 'wait' : 'pointer', fontWeight: 700, fontSize: 14,
            opacity: !isAdmin || importando ? 0.4 : 1, pointerEvents: !isAdmin ? 'none' : undefined,
          }}
        >
          {importando ? '⏳ Importando…' : '📂 Importar .OFX'}
          <input ref={fileInput} type="file" accept=".ofx" style={{ display: 'none' }} disabled={importando}
            onChange={(e) => onNovoArquivo(e.target.files?.[0])} />
        </label>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>}

      {!loading && invoices.length === 0 && (
        <div style={{ background: '#fff', border: '2px dashed #e2e8f0', borderRadius: 16, padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
          <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Importe sua primeira fatura</p>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>Arraste um arquivo .OFX ou clique no botão acima</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {invoices.map((inv) => (
          <div
            key={inv.id}
            style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(59,130,246,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
            onClick={() => navigate(`/faturas/${inv.id}`)}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📋</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 2 }}>
                {inv.name || 'Fatura importada'}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {inv.transaction_count} lançamentos · {inv.imported_at ? new Date(inv.imported_at).toLocaleDateString('pt-BR') : '—'}
                {inv.account_id && cartoes.find((c) => c.id === inv.account_id) ? ` · ${cartoes.find((c) => c.id === inv.account_id)!.name}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{fmt(Number(inv.total ?? 0))}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); excluir(inv) }}
              disabled={!isAdmin}
              style={{ background: 'transparent', border: 'none', cursor: isAdmin ? 'pointer' : 'default', color: '#cbd5e1', fontSize: 16, padding: '4px 8px', borderRadius: 6, display: isAdmin ? undefined : 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#cbd5e1')}
              title="Excluir fatura"
            >✕</button>
          </div>
        ))}
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
