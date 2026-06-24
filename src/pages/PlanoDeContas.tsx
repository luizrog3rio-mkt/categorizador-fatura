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
  rateio_por_produto: boolean
  sort_order: string
  active: boolean
}

// Default de rateio por produto: tudo "acima da margem" rateia (receita/dedução/
// custo variável); estrutura (despesa fixa/financeiro/depreciação/imposto) não.
const rateioPadrao = (n: Nature) => n === 'revenue' || n === 'deduction' || n === 'variable_cost'

const FORM_VAZIO: FormState = {
  code: '',
  name: '',
  parent_id: '',
  nature: 'revenue',
  is_analytical: true,
  rateio_por_produto: true,
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
      .order('sort_order')
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
      rateio_por_produto: c.rateio_por_produto ?? rateioPadrao(c.nature),
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
      rateio_por_produto: form.rateio_por_produto,
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
          <p className="text-center text-fg-subtle py-10 text-sm">Carregando…</p>
        ) : contasFiltradas.length === 0 ? (
          <Vazio mensagem={busca ? 'Nenhuma conta encontrada para esta busca.' : 'Nenhuma conta cadastrada. Crie a primeira no botão acima.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-left px-4 py-3 font-medium text-fg-muted whitespace-nowrap">Código</th>
                  <th className="text-left px-4 py-3 font-medium text-fg-muted">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-fg-muted whitespace-nowrap">Natureza</th>
                  <th className="text-left px-4 py-3 font-medium text-fg-muted whitespace-nowrap">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium text-fg-muted whitespace-nowrap">Rateio p/ produto</th>
                  <th className="text-left px-4 py-3 font-medium text-fg-muted whitespace-nowrap">Ativa</th>
                  {isAdmin && (
                    <th className="text-right px-4 py-3 font-medium text-fg-muted whitespace-nowrap">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {contasFiltradas.map((c) => {
                  const isGrupo = !c.is_analytical
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border last:border-0 ${isGrupo ? 'bg-surface-2' : 'hover:bg-surface-2/50'} ${!c.active ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={isGrupo ? 'font-semibold text-fg' : 'pl-4 text-fg-muted text-xs'}>
                          {c.code}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={isGrupo ? 'font-semibold text-fg' : 'pl-4 text-fg-muted text-xs'}>
                          {c.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Badge cor={NATURE_COLORS[c.nature]}>
                          {NATURE_LABELS[c.nature]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Badge tom={isGrupo ? 'muted' : 'brand'}>
                          {isGrupo ? 'Grupo' : 'Analítica'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Badge tom={c.rateio_por_produto ? 'revenue' : 'muted'}>
                          {c.rateio_por_produto ? 'Sim' : 'Não'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-medium ${c.active ? 'text-revenue' : 'text-fg-subtle'}`}>
                          {c.active ? 'Sim' : 'Não'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              title="Editar"
                              onClick={() => abrirEdicao(c)}
                              className="text-fg-subtle hover:text-brand p-1 transition"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              title={c.active ? 'Desativar' : 'Reativar'}
                              onClick={() => desativar(c)}
                              className={`p-1 transition ${c.active ? 'text-fg-subtle hover:text-expense' : 'text-fg-subtle hover:text-revenue'}`}
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
              onChange={(e) => { const nv = e.target.value as Nature; setForm({ ...form, nature: nv, rateio_por_produto: rateioPadrao(nv) }) }}
            >
              {(Object.entries(NATURE_LABELS) as [Nature, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input
                type="checkbox"
                checked={form.is_analytical}
                onChange={(e) => setForm({ ...form, is_analytical: e.target.checked })}
                className="rounded border-border-strong text-brand focus:ring-brand"
              />
              Analítica (aceita lançamentos)
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input
                type="checkbox"
                checked={form.rateio_por_produto}
                onChange={(e) => setForm({ ...form, rateio_por_produto: e.target.checked })}
                className="rounded border-border-strong text-brand focus:ring-brand"
              />
              Rateia por produto
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded border-border-strong text-brand focus:ring-brand"
              />
              Ativa
            </label>
          </div>
          <p className="text-xs text-fg-subtle -mt-2">
            "Rateia por produto" = a conta aparece por produto na DRE por Produto (receita/dedução/custo variável). Estrutura (despesas fixas/financeiro/impostos) fica na coluna Total.
          </p>

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
