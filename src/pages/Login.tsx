import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Alert, Button, inputCls } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro('E-mail ou senha inválidos.')
    setEnviando(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <form
        onSubmit={entrar}
        className="bg-surface rounded-modal border border-border shadow-pop p-8 w-full max-w-sm space-y-4"
      >
        <div className="text-center">
          {/* wordmark sóbrio, alinhado à marca do Layout */}
          <div className="mx-auto grid place-items-center w-12 h-12 rounded-control bg-brand text-white font-bold text-xl tracking-tight mb-3">
            R
          </div>
          <h1 className="text-2xl font-bold text-fg">RB7 Financeiro</h1>
          <p className="text-sm text-fg-muted mt-1">Importe e analise as finanças</p>
        </div>
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-fg-muted mb-1">E-mail</label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="login-senha" className="block text-sm font-medium text-fg-muted mb-1">Senha</label>
          <input
            id="login-senha"
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={inputCls}
          />
        </div>
        {erro && <Alert tom="danger">{erro}</Alert>}
        <Button type="submit" variante="primary" loading={enviando} className="w-full">
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>
        <p className="text-xs text-fg-subtle text-center">
          Contas de equipe são criadas pelo administrador.
        </p>
      </form>
    </div>
  )
}
