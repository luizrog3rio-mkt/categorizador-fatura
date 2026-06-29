import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import type { Company } from '../lib/types'
import { Card, PageHeader, Modal, Vazio, ErroBanner, inputCls, btnPrimario } from '../components/ui'
import DataTable, { type DataColumn } from '../components/DataTable'

// Cadastro das empresas (CNPJs) do grupo. A tabela `companies` tem RLS de
// modelo-equipe (ALL/authenticated) e grants completos, então o CRUD vai direto
// pelo client. Ao gravar, chama recarregarEmpresas() do AppContext para o
// seletor global e os filtros por empresa refletirem na hora.

export default function Empresas() {
  const { isAdmin, recarregarEmpresas } = useApp()
  const [empresas, setEmpresas] = useState<Company[]>([])
  const [contagem, setContagem] = useState<Record<string, number>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<{ id?: string; name: string; cnpj: string }>({ name: '', cnpj: '' })

  const carregar = useCallback(async () => {
    setErro(null)
    const { data, error } = await supabase.from('companies').select('*').order('name')
    if (error) { setErro('Erro ao carregar empresas: ' + error.message); setCarregando(false); return }
    setEmpresas(data ?? [])
    setCarregando(false)
    // contagem de contas por empresa — dá contexto ao excluir (FK RESTRICT)
    const { data: accs } = await supabase.from('accounts').select('company_id')
    const m: Record<string, number> = {}
    accs?.forEach((a) => { m[a.company_id] = (m[a.company_id] ?? 0) + 1 })
    setContagem(m)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirNovo = () => { setForm({ name: '', cnpj: '' }); setModalAberto(true) }
  const abrirEdicao = useCallback((c: Company) => {
    setForm({ id: c.id, name: c.name, cnpj: c.cnpj ?? '' })
    setModalAberto(true)
  }, [])

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    const payload = { name: form.name.trim(), cnpj: form.cnpj.trim() || null }
    const { error } = form.id
      ? await supabase.from('companies').update(payload).eq('id', form.id)
      : await supabase.from('companies').insert(payload)
    setSalvando(false)
    if (error) { setErro('Erro ao salvar empresa: ' + error.message); return }
    setModalAberto(false)
    await carregar()
    await recarregarEmpresas()
  }

  const excluir = useCallback(async (c: Company) => {
    if (!window.confirm(`Excluir a empresa "${c.name}"?`)) return
    setErro(null)
    const { error } = await supabase.from('companies').delete().eq('id', c.id)
    if (error) {
      // 23503 = foreign_key_violation (ON DELETE RESTRICT): há registros vinculados
      setErro(
        error.code === '23503'
          ? `Não foi possível excluir "${c.name}": há contas, lançamentos ou outros registros vinculados a ela. Remova-os antes de excluir a empresa.`
          : 'Erro ao excluir empresa: ' + error.message
      )
      return
    }
    await carregar()
    await recarregarEmpresas()
  }, [carregar, recarregarEmpresas])

  const colunas = useMemo<DataColumn<Company>[]>(() => [
    { id: 'name', header: 'Empresa', size: 300, cell: (c) => <span className="font-medium text-fg">{c.name}</span> },
    { id: 'cnpj', header: 'CNPJ', size: 200, cell: (c) => <span className="text-fg-muted">{c.cnpj || '—'}</span> },
    { id: 'contas', header: 'Contas', size: 90, align: 'right', cell: (c) => <span className="text-fg-muted tnum">{contagem[c.id] ?? 0}</span> },
    { id: 'created_at', header: 'Criada em', size: 130, cell: (c) => <span className="text-fg-muted text-xs">{c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}</span> },
    { id: 'acoes', header: '', label: 'Ações', size: 100, align: 'right', enableHiding: false, cell: (c) => (
      isAdmin ? (
        <div className="flex gap-2 justify-end">
          <button title="Editar" onClick={() => abrirEdicao(c)} className="text-fg-subtle hover:text-brand"><Pencil size={16} /></button>
          <button title="Excluir" onClick={() => excluir(c)} className="text-fg-subtle hover:text-expense"><Trash2 size={16} /></button>
        </div>
      ) : null
    ) },
  ], [isAdmin, contagem, abrirEdicao, excluir])

  return (
    <div>
      <PageHeader
        titulo="Empresas"
        subtitulo="Cadastro das empresas (CNPJs) do grupo"
        acao={
          <button onClick={abrirNovo} disabled={!isAdmin} className={btnPrimario}>
            <Plus size={16} /> Nova empresa
          </button>
        }
      />

      <ErroBanner mensagem={erro} />

      <Card>
        {empresas.length === 0 ? (
          <Vazio mensagem={carregando ? 'Carregando…' : 'Nenhuma empresa cadastrada.'} />
        ) : (
          <DataTable tableKey="empresas" columns={colunas} data={empresas} getRowId={(c) => c.id} />
        )}
      </Card>

      <Modal titulo={form.id ? 'Editar empresa' : 'Nova empresa'} aberto={modalAberto} onFechar={() => setModalAberto(false)}>
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome *</label>
            <input required autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">CNPJ</label>
            <input className={inputCls} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
          </div>
          <button type="submit" disabled={salvando || !form.name.trim()} className={btnPrimario + ' w-full justify-center'}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
