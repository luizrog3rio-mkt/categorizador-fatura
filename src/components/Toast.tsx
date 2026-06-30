import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

// Toast efêmero (feedback de SUCESSO/erro de ações). Ações de impacto — pagar,
// conciliar, salvar, importar — retornavam em silêncio (só o caminho de erro
// aparecia). useToast() dá um aviso curto que some sozinho. Provider montado no App.

type Tom = 'success' | 'danger' | 'info'
interface ToastItem { id: number; msg: string; tom: Tom }

const ToastCtx = createContext<(msg: string, tom?: Tom) => void>(() => {})

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastCtx)

const estilo: Record<Tom, string> = {
  success: 'bg-revenue-bg text-revenue',
  danger: 'bg-expense-bg text-expense',
  info: 'bg-surface-2 text-fg',
}
const Icone = { success: CheckCircle2, danger: AlertTriangle, info: Info }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const remover = useCallback((id: number) => setItens((prev) => prev.filter((t) => t.id !== id)), [])

  const toast = useCallback((msg: string, tom: Tom = 'success') => {
    const id = ++seq.current
    setItens((prev) => [...prev, { id, msg, tom }])
    setTimeout(() => remover(id), 3500)
  }, [remover])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm" role="status" aria-live="polite">
        {itens.map((t) => {
          const Ic = Icone[t.tom]
          return (
            <div
              key={t.id}
              className={`flex items-start gap-2.5 rounded-card border border-border shadow-pop px-4 py-3 text-sm ${estilo[t.tom]}`}
            >
              <Ic size={18} className="shrink-0 mt-px" />
              <span className="flex-1 text-fg">{t.msg}</span>
              <button onClick={() => remover(t.id)} className="shrink-0 text-fg-subtle hover:text-fg" aria-label="Fechar aviso">
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}
