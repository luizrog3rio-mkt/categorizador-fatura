import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, PageHeader, ErroBanner, Modal, btnPrimario, btnSecundario } from '../components/ui'
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
  const [periodos] = useState<string[]>(gerarUltimos24Meses)
  const [fechados, setFechados] = useState<ClosedPeriod[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [modalFechar, setModalFechar] = useState<string | null>(null)
  const [modalReabrir, setModalReabrir] = useState<ClosedPeriod | null>(null)
  const [salvando, setSalvando] = useState(false)

  const atual = mesAtual()

  const carregar = useCallback(async () => {
    if (!empresaAtiva) return
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase
      .from('closed_periods')
      .select('*')
      .eq('company_id', empresaAtiva)
    if (error) {
      setErro(error.message)
    } else {
      setFechados(data ?? [])
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
      company_id: empresaAtiva,
      period,
      closed_by: session.user.email ?? session.user.id,
    })
    setSalvando(false)
    if (error) {
      setErro(error.message)
    } else {
      setModalFechar(null)
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
      setModalReabrir(null)
      await carregar()
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Períodos Fechados" subtitle="Controle de competências encerradas para lançamentos" />

      {erro && <ErroBanner mensagem={erro} />}

      <Card>
        {carregando ? (
          <p className="text-sm text-gray-500 p-4">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-medium">Mês / Ano</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Fechado por / quando</th>
                  {isAdmin && <th className="px-4 py-3 font-medium text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {periodos.map((periodo) => {
                  const cp = mapFechados.get(periodo)
                  const isFechado = !!cp
                  const isAtualOuFuturo = periodo >= atual

                  return (
                    <tr key={periodo} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800 capitalize">
                        {labelPeriodo(periodo)}
                      </td>
                      <td className="px-4 py-3">
                        {isFechado ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            Fechado
                          </span>
                        ) : isAtualOuFuturo ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                            Em aberto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            Aberto
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {cp ? (
                          <span>
                            {cp.closed_by}
                            {' · '}
                            {fmtData(cp.closed_at)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
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
          onClose={() => !salvando && setModalFechar(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Deseja fechar o período{' '}
              <strong className="capitalize">{labelPeriodo(modalFechar)}</strong>?
            </p>
            <p className="text-sm text-gray-500">
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
          onClose={() => !salvando && setModalReabrir(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Deseja reabrir o período{' '}
              <strong className="capitalize">{labelPeriodo(modalReabrir.period)}</strong>?
            </p>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-800">Aviso de integridade</p>
              <p className="mt-1 text-sm text-amber-700">
                A reabertura de um período fechado pode comprometer a integridade contábil,
                permitindo alterações em competências já conciliadas ou reportadas. Prossiga
                apenas se tiver certeza.
              </p>
            </div>
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
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
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
