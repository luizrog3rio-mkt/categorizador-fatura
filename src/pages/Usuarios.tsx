import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Ban, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { Card, PageHeader, Modal, Badge, Vazio, ErroBanner, inputCls, btnPrimario } from '../components/ui'
import { useConfirm } from '../components/Confirm'
import { useToast } from '../components/Toast'
import DataTable, { type DataColumn } from '../components/DataTable'

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
  const confirmar = useConfirm()
  const toast = useToast()
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
      toast('Usuário criado')
      carregar()
    } catch (e) {
      setErro(msgErro(e))
    }
    setSalvando(false)
  }

  const mudarRole = useCallback(async (userId: string, role: 'admin' | 'viewer') => {
    setErro(null)
    try {
      await chamar('update_role', { user_id: userId, role })
      setUsuarios((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
    } catch (e) {
      setErro(msgErro(e))
      carregar()
    }
  }, [carregar])

  const toggleBan = useCallback(async (u: UsuarioAdmin) => {
    const acao = u.banned ? 'reativar' : 'desativar'
    if (!(await confirmar({ titulo: `${u.banned ? 'Reativar' : 'Desativar'} acesso`, mensagem: `Quer ${acao} o acesso de ${u.email}?`, confirmar: u.banned ? 'Reativar' : 'Desativar', perigo: !u.banned }))) return
    setErro(null)
    try {
      await chamar('set_banned', { user_id: u.id, banned: !u.banned })
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, banned: !u.banned } : x)))
      toast(u.banned ? 'Acesso reativado' : 'Acesso desativado', 'info')
    } catch (e) {
      setErro(msgErro(e))
    }
  }, [confirmar, toast])

  const excluir = useCallback(async (u: UsuarioAdmin) => {
    if (!(await confirmar({ titulo: 'Excluir conta', confirmar: 'Excluir', perigo: true, mensagem: `Excluir a conta de ${u.email}?\n\nEssa ação não tem desfazer — todos os dados criados por ela permanecem no sistema.` }))) return
    setErro(null)
    try {
      await chamar('delete', { user_id: u.id })
      setUsuarios((prev) => prev.filter((x) => x.id !== u.id))
      toast('Conta excluída', 'info')
    } catch (e) {
      setErro(msgErro(e))
    }
  }, [confirmar, toast])

  const ehEu = useCallback((id: string) => id === session?.user.id, [session])

  const colunas = useMemo<DataColumn<UsuarioAdmin>[]>(() => [
    { id: 'email', header: 'E-mail', size: 260, cell: (u) => (
      <span className="font-medium text-fg">
        {u.email}
        {ehEu(u.id) && <span className="ml-2 text-xs text-fg-subtle">(você)</span>}
      </span>
    ) },
    { id: 'role', header: 'Papel', size: 150, cell: (u) => (
      ehEu(u.id) ? (
        <Badge tom={u.role === 'admin' ? 'brand' : 'muted'}>{u.role === 'admin' ? 'Admin' : 'Visualizador'}</Badge>
      ) : (
        <select
          value={u.role}
          onChange={(e) => mudarRole(u.id, e.target.value as 'admin' | 'viewer')}
          className="rounded-control border border-border px-2 py-1 text-xs font-medium bg-surface cursor-pointer"
        >
          <option value="admin">Admin</option>
          <option value="viewer">Visualizador</option>
        </select>
      )
    ) },
    { id: 'status', header: 'Status', size: 120, cell: (u) => (
      <Badge tom={u.banned ? 'expense' : 'revenue'}>{u.banned ? 'Desativado' : 'Ativo'}</Badge>
    ) },
    { id: 'last_sign_in_at', header: 'Último acesso', size: 140, cell: (u) => (
      <span className="text-fg-muted text-xs">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('pt-BR') : '—'}</span>
    ) },
    { id: 'acoes', header: '', label: 'Ações', size: 100, align: 'right', enableHiding: false, cell: (u) => (
      !ehEu(u.id) ? (
        <div className="flex gap-2 justify-end">
          <button
            title={u.banned ? 'Reativar acesso' : 'Desativar acesso'}
            onClick={() => toggleBan(u)}
            className={u.banned ? 'text-revenue hover:brightness-110' : 'text-fg-subtle hover:text-warning'}
          >
            {u.banned ? <CheckCircle size={16} /> : <Ban size={16} />}
          </button>
          <button title="Excluir conta" onClick={() => excluir(u)} className="text-fg-subtle hover:text-expense">
            <Trash2 size={16} />
          </button>
        </div>
      ) : null
    ) },
  ], [ehEu, mudarRole, toggleBan, excluir])

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
          <Vazio mensagem="Carregando…" />
        ) : usuarios.length === 0 ? (
          <Vazio mensagem="Nenhum usuário encontrado." />
        ) : (
          <DataTable
            tableKey="usuarios"
            columns={colunas}
            data={usuarios}
            getRowId={(u) => u.id}
          />
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted"
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
          {erro && <p className="text-sm text-expense">{erro}</p>}
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
