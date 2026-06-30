import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Modal, Button } from './ui'

// Confirmação no padrão do design system (substitui o window.confirm nativo, que
// destoa do visual e some atrás do app). useConfirm() devolve uma função async:
//   if (!(await confirm({ mensagem: '...', perigo: true }))) return
// Provider montado no App; resolve uma Promise<boolean> no Confirmar/Cancelar.

interface Opcoes {
  titulo?: string
  mensagem: ReactNode
  confirmar?: string // rótulo do botão (default "Confirmar")
  perigo?: boolean // botão vermelho (ação destrutiva)
}

const ConfirmCtx = createContext<(opts: Opcoes) => Promise<boolean>>(() => Promise.resolve(false))

// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<Opcoes | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((o: Opcoes) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  const fechar = useCallback((v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setOpts(null)
  }, [])

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <Modal
          titulo={opts.titulo ?? 'Confirmar'}
          aberto={true}
          onFechar={() => fechar(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variante="secondary" onClick={() => fechar(false)}>Cancelar</Button>
              <Button variante={opts.perigo ? 'danger' : 'primary'} onClick={() => fechar(true)}>{opts.confirmar ?? 'Confirmar'}</Button>
            </div>
          }
        >
          <div className="text-sm text-fg-muted whitespace-pre-line">{opts.mensagem}</div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  )
}
