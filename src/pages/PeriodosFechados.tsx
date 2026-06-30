import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { Card, PageHeader, ErroBanner, Modal, Badge, Alert, btnPrimario, btnSecundario } from '../components/ui'
import { useToast } from '../components/Toast'
import { fmtData } from '../lib/format'

interface ClosedPeriod {
  id: string
  company_id: string
  period: string
  closed_at: string
  closed_by: string
}

const labelPeriodo = (p: string) => {
  const [y, m] = p.split('-')
  return new Date(+y, +m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function gerarUltimos24Meses(): string[] {
  const meses: string[] = []
  const hoje = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    meses.push(`${y}-${m}`)
  }
  return meses
}

function mesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function PeriodosFechados() {
  const { isAdmin, empresaAtiva, session } = useApp()
  const toast = useToast()
  const [periodos] = useState<string[]>(gerarUltimos24Meses)
  const [fechados, setFechados] = useState<ClosedPeriod[]>([])
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [modalFechar, setModalFechar] = useState<string | null>(null)
  const [modalReabrir, setModalReabrir] = useState<ClosedPeriod | null>(null)
  const [salvando, setSalvando] = useState(false)

  const atual = mesAtual()

  const carregar = useCallback(async () => {
    if (!empresaAtiva) {
      setFechados([])
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase
      .from('closed_periods')
      .select('*')
      .eq('company_id', empresaAtiva.id)
    if (error) {
      setErro(error.message)
    } else {
      setFechados(data ?? [])
      // resolve closed_by (uuid) -> email pelos profiles, pra não mostrar UUID cru
      const ids = [...new Set((data ?? []).map((d) => d.closed_by).filter(Boolean))]
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id,email').in('id', ids)
        const m: Record<string, string> = {}
        profs?.forEach((p) => { m[p.id] = p.email })
        setEmails(m)
      }
    }
    setCarregando(false)
  }, [empresaAtiva])

  useEffect(() => {
    carregar()
  }, [carregar])

  const mapFechados = new Map(fechados.map((f) => [f.period, f]))

  async function fecharPeriodo(period: string) {
    if (!empresaAtiva || !session?.user) return
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('closed_periods').insert({
      company_id: empresaAtiva.id,
      period,
      closed_by: session.user.id,
    })
    setSalvando(false)
    if (error) {
      setErro(error.message)
    } else {
      setModalFechar(null)
      toast(`${labelPeriodo(period)} fechado`)
      await carregar()
    }
  }

  async function reabrirPeriodo(cp: ClosedPeriod) {
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('closed_periods').delete().eq('id', cp.id)
    setSalvando(false)
    if (error) {
      setErro(error.message)
    } else {
      const lbl = labelPeriodo(cp.period)
      setModalReabrir(null)
      toast(`${lbl} reaberto`, 'info')
      await carregar()
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Períodos Fechados" subtitulo="Controle de competências encerradas para lançamentos" />

      {erro && <ErroBanner mensagem={erro} />}

      {!empresaAtiva && !carregando && (
        <p className="text-sm text-fg-muted">Selecione uma empresa para gerenciar os períodos fechados.</p>
      )}

      <Card>
        {carregando ? (
          <p className="text-sm text-fg-muted p-4">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-3 font-medium">Mês / Ano</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Fechado por / quando</th>
                  {isAdmin && <th className="px-4 py-3 font-medium text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {periodos.map((periodo) => {
                  const cp = mapFechados.get(periodo)
                  const isFechado = !!cp
                  const isAtualOuFuturo = periodo >= atual

                  return (
                    <tr key={periodo} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3 font-medium text-fg capitalize">
                        {labelPeriodo(periodo)}
                      </td>
                      <td className="px-4 py-3">
                        {isFechado ? (
                          <Badge tom="expense">Fechado</Badge>
                        ) : isAtualOuFuturo ? (
                          <Badge tom="muted">Em aberto</Badge>
                        ) : (
                          <Badge tom="revenue">Aberto</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">
                        {cp ? (
                          <span>
                            {cp.closed_by === session?.user?.id ? 'você' : (emails[cp.closed_by] ?? 'usuário')}
                            {' · '}
                            {fmtData(cp.closed_at)}
                          </span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          {isFechado ? (
                            <button
                              onClick={() => setModalReabrir(cp)}
                              className={btnSecundario + ' text-xs'}
                            >
                              Reabrir
                            </button>
                          ) : isAtualOuFuturo ? (
                            <span title="Não é possível fechar o mês atual ou meses futuros">
                              <button
                                disabled
                                className={btnPrimario + ' text-xs opacity-40 cursor-not-allowed'}
                              >
                                Fechar período
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setModalFechar(periodo)}
                              className={btnPrimario + ' text-xs'}
                            >
                              Fechar período
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal: confirmar fechamento */}
      {modalFechar && (
        <Modal
          titulo="Fechar período"
          aberto={!!modalFechar}
          onFechar={() => !salvando && setModalFechar(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              Deseja fechar o período{' '}
              <strong className="capitalize">{labelPeriodo(modalFechar)}</strong>?
            </p>
            <p className="text-sm text-fg-muted">
              Após o fechamento, novos lançamentos neste período serão bloqueados. A ação
              pode ser desfeita pelo administrador.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalFechar(null)}
                disabled={salvando}
                className={btnSecundario}
              >
                Cancelar
              </button>
              <button
                onClick={() => fecharPeriodo(modalFechar)}
                disabled={salvando}
                className={btnPrimario}
              >
                {salvando ? 'Salvando…' : 'Confirmar fechamento'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: confirmar reabertura */}
      {modalReabrir && (
        <Modal
          titulo="Reabrir período"
          aberto={!!modalReabrir}
          onFechar={() => !salvando && setModalReabrir(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              Deseja reabrir o período{' '}
              <strong className="capitalize">{labelPeriodo(modalReabrir.period)}</strong>?
            </p>
            <Alert tom="warning" titulo="Aviso de integridade">
              A reabertura de um período fechado pode comprometer a integridade contábil,
              permitindo alterações em competências já conciliadas ou reportadas. Prossiga
              apenas se tiver certeza.
            </Alert>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalReabrir(null)}
                disabled={salvando}
                className={btnSecundario}
              >
                Cancelar
              </button>
              <button
                onClick={() => reabrirPeriodo(modalReabrir)}
                disabled={salvando}
                className="rounded-control bg-warning px-4 py-2 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
              >
                {salvando ? 'Processando…' : 'Reabrir mesmo assim'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
