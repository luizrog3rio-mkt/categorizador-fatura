import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil, PowerOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import type { ChartOfAccount } from '../lib/types'
import { Card, PageHeader, Modal, Vazio, ErroBanner, Badge, inputCls, btnPrimario, btnSecundario } from '../components/ui'

// Naturezas disponíveis (espelha o CHECK do banco)
type Nature = ChartOfAccount['nature']

const NATURE_LABELS: Record<Nature, string> = {
  revenue: 'Receita',
  deduction: 'Dedução',
  variable_cost: 'Custo Variável',
  fixed_cost: 'Custo Fixo',
  financial: 'Financeiro',
  depreciation: 'Depreciação',
  tax: 'Imposto',
}

const NATURE_COLORS: Record<Nature, string> = {
  revenue: '#22c55e',
  deduction: '#f97316',
  variable_cost: '#eab308',
  fixed_cost: '#ef4444',
  financial: '#3b82f6',
  depreciation: '#94a3b8',
  tax: '#8b5cf6',
}

interface ChartRow extends Omit<ChartOfAccount, 'parent'> {
  parent?: { code: string; name: string } | null
}

interface FormState {
  id?: string
  code: string
  name: string
  parent_id: string
  nature: Nature
  is_analytical: boolean
  sort_order: string
  active: boolean
}

const FORM_VAZIO: FormState = {
  code: '',
  name: '',
  parent_id: '',
  nature: 'revenue',
  is_analytical: true,
  sort_order: '0',
  active: true,
}

export default function PlanoDeContas() {
  const { isAdmin } = useApp()
  const [contas, setContas] = useState<ChartRow[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<FormState>(FORM_VAZIO)
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*, parent:chart_of_accounts!parent_id(code,name)')
      .order('code')
    if (error) {
      setErro('Erro ao carregar plano de contas: ' + error.message)
      setCarregando(false)
      return
    }
    setContas((data as ChartRow[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const contasGrupo = contas.filter((c) => !c.is_analytical)

  const abrirNovo = () => {
    setForm(FORM_VAZIO)
    setModal(true)
  }

  const abrirEdicao = (c: ChartRow) => {
    setForm({
      id: c.id,
      code: c.code,
      name: c.name,
      parent_id: c.parent_id ?? '',
      nature: c.nature,
      is_analytical: c.is_analytical,
      sort_order: String(c.sort_order),
      active: c.active,
    })
    setModal(true)
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null)
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      parent_id: form.parent_id || null,
      nature: form.nature,
      is_analytical: form.is_analytical,
      sort_order: Number(form.sort_order) || 0,
      active: form.active,
    }
    if (!payload.code || !payload.name) {
      setErro('Código e nome são obrigatórios.')
      return
    }
    if (form.id) {
      const { error } = await supabase
        .from('chart_of_accounts')
        .update(payload)
        .eq('id', form.id)
      if (error) { setErro('Erro ao salvar: ' + error.message); return }
    } else {
      const { error } = await supabase
        .from('chart_of_accounts')
        .insert(payload)
      if (error) { setErro('Erro ao criar: ' + error.message); return }
    }
    setModal(false)
    carregar()
  }

  const desativar = async (c: ChartRow) => {
    const acao = c.active ? 'desativar' : 'reativar'
    if (!window.confirm(`Deseja ${acao} a conta "${c.code} – ${c.name}"?`)) return
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ active: !c.active })
      .eq('id', c.id)
    if (error) { setErro(`Erro ao ${acao}: ` + error.message); return }
    carregar()
  }

  const contasFiltradas = contas.filter((c) => {
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  })

  return (
    <div>
      <PageHeader
        titulo="Plano de Contas"
        subtitulo="Estrutura hierárquica de contas para a DRE"
        acao={
          isAdmin ? (
            <button onClick={abrirNovo} className={btnPrimario}>
              <Plus size={16} /> Nova conta
            </button>
          ) : undefined
        }
      />

      <ErroBanner mensagem={erro} />

      <div className="mb-4">
        <input
          type="search"
          placeholder="Buscar por código ou nome…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className={inputCls + ' max-w-xs'}
        />
      </div>

      <Card>
        {carregando ? (
          <p className="text-center text-slate-400 py-10 text-sm">Carregando…</p>
        ) : contasFiltradas.length === 0 ? (
          <Vazio mensagem={busca ? 'Nenhuma conta encontrada para esta busca.' : 'Nenhuma conta cadastrada. Crie a primeira no botão acima.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Código</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Natureza</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Ativa</th>
                  {isAdmin && (
                    <th className="text-right px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {contasFiltradas.map((c) => {
                  const isGrupo = !c.is_analytical
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-slate-100 last:border-0 ${isGrupo ? 'bg-slate-50' : 'hover:bg-slate-50/50'} ${!c.active ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={isGrupo ? 'font-semibold text-slate-800' : 'pl-4 text-slate-600 text-xs'}>
                          {c.code}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={isGrupo ? 'font-semibold text-slate-800' : 'pl-4 text-slate-600 text-xs'}>
                          {c.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Badge cor={NATURE_COLORS[c.nature]}>
                          {NATURE_LABELS[c.nature]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isGrupo ? 'bg-slate-200 text-slate-700' : 'bg-indigo-50 text-indigo-700'}`}>
                          {isGrupo ? 'Grupo' : 'Analítica'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-medium ${c.active ? 'text-green-600' : 'text-slate-400'}`}>
                          {c.active ? 'Sim' : 'Não'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              title="Editar"
                              onClick={() => abrirEdicao(c)}
                              className="text-slate-400 hover:text-indigo-600 p-1 transition"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              title={c.active ? 'Desativar' : 'Reativar'}
                              onClick={() => desativar(c)}
                              className={`p-1 transition ${c.active ? 'text-slate-400 hover:text-red-500' : 'text-slate-400 hover:text-green-600'}`}
                            >
                              <PowerOff size={15} />
                            </button>
                          </div>
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

      <Modal
        titulo={form.id ? 'Editar conta' : 'Nova conta'}
        aberto={modal}
        onFechar={() => setModal(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <ErroBanner mensagem={erro} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Código *</label>
              <input
                required
                autoFocus
                className={inputCls}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="ex: 3.1.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ordem</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Nome *</label>
            <input
              required
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome da conta"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Conta-pai (grupo)</label>
            <select
              className={inputCls}
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            >
              <option value="">(sem pai — conta raiz)</option>
              {contasGrupo.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} – {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Natureza</label>
            <select
              className={inputCls}
              value={form.nature}
              onChange={(e) => setForm({ ...form, nature: e.target.value as Nature })}
            >
              {(Object.entries(NATURE_LABELS) as [Nature, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input
                type="checkbox"
                checked={form.is_analytical}
                onChange={(e) => setForm({ ...form, is_analytical: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Analítica (aceita lançamentos)
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Ativa
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" className={btnPrimario + ' flex-1 justify-center'}>
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setModal(false)}
              className={btnSecundario}
            >
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
