import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Ban, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { Card, PageHeader, Modal, ErroBanner, inputCls, btnPrimario } from '../components/ui'

interface UsuarioAdmin {
  id: string
  email: string
  role: 'admin' | 'viewer'
  banned: boolean
  created_at: string
  last_sign_in_at: string | null
}

const chamar = async (action: string, params = {}) => {
  const { data, error } = await supabase.functions.invoke('user-management', {
    body: { action, ...params },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function Usuarios() {
  const { session } = useApp()
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', role: 'viewer' as 'admin' | 'viewer' })
  const [salvando, setSalvando] = useState(false)
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const data = await chamar('list')
      setUsuarios(data)
    } catch (e) {
      setErro(msgErro(e))
    }
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const criar = async () => {
    if (!form.email || !form.password) return
    setSalvando(true)
    setErro(null)
    try {
      await chamar('create', form)
      setModal(false)
      setForm({ email: '', password: '', role: 'viewer' })
      carregar()
    } catch (e) {
      setErro(msgErro(e))
    }
    setSalvando(false)
  }

  const mudarRole = async (userId: string, role: 'admin' | 'viewer') => {
    setErro(null)
    try {
      await chamar('update_role', { user_id: userId, role })
      setUsuarios((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
    } catch (e) {
      setErro(msgErro(e))
      carregar()
    }
  }

  const toggleBan = async (u: UsuarioAdmin) => {
    const acao = u.banned ? 'reativar' : 'desativar'
    if (!window.confirm(`Quer ${acao} o acesso de ${u.email}?`)) return
    setErro(null)
    try {
      await chamar('set_banned', { user_id: u.id, banned: !u.banned })
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, banned: !u.banned } : x)))
    } catch (e) {
      setErro(msgErro(e))
    }
  }

  const excluir = async (u: UsuarioAdmin) => {
    if (!window.confirm(`Excluir a conta de ${u.email}?\n\nEssa ação não tem desfazer — todos os dados criados por ela permanecem no sistema.`)) return
    setErro(null)
    try {
      await chamar('delete', { user_id: u.id })
      setUsuarios((prev) => prev.filter((x) => x.id !== u.id))
    } catch (e) {
      setErro(msgErro(e))
    }
  }

  const ehEu = (id: string) => id === session?.user.id

  return (
    <div>
      <PageHeader
        titulo="Usuários"
        subtitulo="Gerencie os acessos ao sistema"
        acao={
          <button onClick={() => { setModal(true); setErro(null) }} className={btnPrimario}>
            <Plus size={16} /> Novo usuário
          </button>
        }
      />

      <ErroBanner mensagem={erro} />

      <Card>
        {loading ? (
          <p className="text-center text-slate-400 py-10 text-sm">Carregando…</p>
        ) : usuarios.length === 0 ? (
          <p className="text-center text-slate-400 py-10 text-sm">Nenhum usuário encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Último acesso</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {u.email}
                      {ehEu(u.id) && <span className="ml-2 text-xs text-slate-400">(você)</span>}
                    </td>
                    <td className="px-4 py-3">
                      {ehEu(u.id) ? (
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                          Admin
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => mudarRole(u.id, e.target.value as 'admin' | 'viewer')}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium bg-white cursor-pointer"
                        >
                          <option value="admin">Admin</option>
                          <option value="viewer">Visualizador</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${u.banned ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {u.banned ? 'Desativado' : 'Ativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {!ehEu(u.id) && (
                        <div className="flex gap-2 justify-end">
                          <button
                            title={u.banned ? 'Reativar acesso' : 'Desativar acesso'}
                            onClick={() => toggleBan(u)}
                            className={u.banned ? 'text-green-500 hover:text-green-700' : 'text-slate-400 hover:text-amber-600'}
                          >
                            {u.banned ? <CheckCircle size={16} /> : <Ban size={16} />}
                          </button>
                          <button
                            title="Excluir conta"
                            onClick={() => excluir(u)}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal titulo="Novo usuário" aberto={modal} onFechar={() => setModal(false)}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">E-mail *</label>
            <input
              type="email"
              autoFocus
              className={inputCls}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Senha temporária *</label>
            <div className="relative">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                className={inputCls + ' pr-10'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Papel</label>
            <select
              className={inputCls}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'viewer' })}
            >
              <option value="admin">Admin — acesso total</option>
              <option value="viewer">Visualizador — só leitura</option>
            </select>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <button
            onClick={criar}
            disabled={salvando || !form.email || !form.password}
            className={btnPrimario + ' w-full justify-center'}
          >
            {salvando ? 'Criando…' : 'Criar usuário'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
