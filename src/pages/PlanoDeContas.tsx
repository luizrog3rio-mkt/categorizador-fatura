import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Pencil, PowerOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import type { ChartAccountNature, ChartAccountType, ChartOfAccount, DreProduct } from '../lib/types'
import { Card, PageHeader, Modal, Vazio, ErroBanner, Badge, inputCls, btnPrimario, btnSecundario } from '../components/ui'
import { useConfirm } from '../components/Confirm'
import { useToast } from '../components/Toast'

// Naturezas disponíveis (espelha o CHECK do banco)
type Nature = ChartAccountNature

const NATURE_LABELS: Record<Nature, string> = {
  revenue: 'Receita',
  deduction: 'Dedução',
  variable_cost: 'Custo Variável',
  fixed_cost: 'Custo Fixo',
  financial: 'Financeiro',
  depreciation: 'Depreciação',
  tax: 'Imposto',
  asset: 'Ativo',
  liability: 'Passivo',
  equity: 'Patrimônio Líquido',
}

const NATURE_COLORS: Record<Nature, string> = {
  revenue: '#22c55e',
  deduction: '#f97316',
  variable_cost: '#eab308',
  fixed_cost: '#ef4444',
  financial: '#3b82f6',
  depreciation: '#94a3b8',
  tax: '#8b5cf6',
  asset: '#06b6d4',
  liability: '#f43f5e',
  equity: '#a855f7',
}

const RESULT_NATURES: Nature[] = ['revenue', 'deduction', 'variable_cost', 'fixed_cost', 'financial', 'depreciation', 'tax']
const PATRIMONIAL_NATURES: Nature[] = ['asset', 'liability', 'equity']

interface ChartRow extends Omit<ChartOfAccount, 'parent'> {
  parent?: { code: string; name: string } | null
}

interface FormState {
  id?: string
  code: string
  name: string
  parent_id: string
  company_id: string
  tipo: ChartAccountType
  nature: Nature
  redutora: boolean
  is_analytical: boolean
  rateio_por_produto: boolean
  dre_product_id: string // vínculo conta → produto DRE (só vale acima da margem)
  sort_order: string
  active: boolean
}

// Default de rateio por produto: tudo "acima da margem" rateia (receita/dedução/
// custo variável); estrutura (despesa fixa/financeiro/depreciação/imposto) não.
const rateioPadrao = (n: Nature) => n === 'revenue' || n === 'deduction' || n === 'variable_cost'

// A "Ordem" (sort_order) deriva direto do código: cada nível ocupa 3 dígitos
// (1.2.01 -> 1*1_000_000 + 2*1_000 + 1 = 1_002_001). Mesma fórmula da migration
// plano_contas_v2, então a ordenação da tabela espelha a hierarquia do código.
const ordemDoCodigo = (code: string): number => {
  const [a = 0, b = 0, c = 0] = code.split('.').map((s) => parseInt(s, 10) || 0)
  return a * 1_000_000 + b * 1_000 + c
}

const FORM_VAZIO: FormState = {
  code: '',
  name: '',
  parent_id: '',
  company_id: '',
  tipo: 'resultado',
  nature: 'revenue',
  redutora: false,
  is_analytical: true,
  rateio_por_produto: true,
  dre_product_id: '',
  sort_order: '0',
  active: true,
}

export default function PlanoDeContas() {
  const { isAdmin, empresas, empresaAtiva } = useApp()
  const confirmar = useConfirm()
  const toast = useToast()
  const [contas, setContas] = useState<ChartRow[]>([])
  const [produtos, setProdutos] = useState<DreProduct[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<FormState>(FORM_VAZIO)
  const [busca, setBusca] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState(empresaAtiva?.id ?? 'todas')
  const [filtroTipo, setFiltroTipo] = useState<ChartAccountType | 'todos'>('todos')

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
    const { data: prods } = await supabase.from('dre_products').select('*').eq('active', true).order('sort_order')
    setProdutos((prods as DreProduct[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (empresaAtiva) setFiltroEmpresa(empresaAtiva.id)
  }, [empresaAtiva])

  const contasGrupo = useMemo(() => contas.filter((c) =>
    !c.is_analytical && c.tipo === form.tipo && (c.company_id === null || c.company_id === form.company_id)
  ), [contas, form.company_id, form.tipo])

  const abrirNovo = () => {
    const companyId = filtroEmpresa !== 'todas' ? filtroEmpresa : empresaAtiva?.id ?? ''
    const tipo = filtroTipo === 'todos' ? 'resultado' : filtroTipo
    setForm({
      ...FORM_VAZIO,
      company_id: companyId,
      tipo,
      nature: tipo === 'patrimonial' ? 'asset' : 'revenue',
    })
    setModal(true)
  }

  const abrirEdicao = (c: ChartRow) => {
    setForm({
      id: c.id,
      code: c.code,
      name: c.name,
      parent_id: c.parent_id ?? '',
      company_id: c.company_id ?? '',
      tipo: c.tipo,
      nature: c.nature,
      redutora: c.redutora ?? false,
      is_analytical: c.is_analytical,
      rateio_por_produto: c.rateio_por_produto ?? rateioPadrao(c.nature),
      dre_product_id: c.dre_product_id ?? '',
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
      company_id: form.company_id || null,
      tipo: form.tipo,
      nature: form.nature,
      redutora: form.tipo === 'patrimonial' && form.redutora,
      is_analytical: form.is_analytical,
      // produto só vale acima da margem; rateio_por_produto reaproveitado = "tem produto?"
      dre_product_id: form.tipo === 'resultado' && rateioPadrao(form.nature) ? (form.dre_product_id || null) : null,
      rateio_por_produto: form.tipo === 'resultado' && rateioPadrao(form.nature) && !!form.dre_product_id,
      sort_order: Number(form.sort_order) || 0,
      active: form.active,
    }
    if (!payload.code || !payload.name) {
      setErro('Código e nome são obrigatórios.')
      return
    }
    if (!form.company_id) {
      setErro('Toda conta pertence a uma empresa — o plano é separado por empresa.')
      return
    }
    if (form.id) {
      // anti-ciclo: o pai não pode ser a própria conta nem um descendente dela
      const descendentes = new Set<string>([form.id])
      for (let mudou = true; mudou;) {
        mudou = false
        for (const c of contas) {
          if (c.parent_id && descendentes.has(c.parent_id) && !descendentes.has(c.id)) { descendentes.add(c.id); mudou = true }
        }
      }
      if (payload.parent_id && descendentes.has(payload.parent_id)) {
        setErro('Uma conta não pode ser filha de si mesma ou de uma conta abaixo dela na hierarquia.')
        return
      }
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
    toast(form.id ? 'Conta atualizada' : 'Conta criada')
    carregar()
  }

  const desativar = async (c: ChartRow) => {
    const acao = c.active ? 'desativar' : 'reativar'
    if (!(await confirmar({ titulo: `${c.active ? 'Desativar' : 'Reativar'} conta`, mensagem: `Deseja ${acao} a conta "${c.code} – ${c.name}"?`, confirmar: c.active ? 'Desativar' : 'Reativar', perigo: c.active }))) return
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ active: !c.active })
      .eq('id', c.id)
    if (error) { setErro(`Erro ao ${acao}: ` + error.message); return }
    toast(c.active ? 'Conta desativada' : 'Conta reativada', 'info')
    carregar()
  }

  const contasFiltradas = contas.filter((c) => {
    if (filtroTipo !== 'todos' && c.tipo !== filtroTipo) return false
    // cada empresa tem o SEU plano (separação de 2026-07-18); conta legada sem empresa ainda aparece
    if (filtroEmpresa !== 'todas' && c.company_id !== null && c.company_id !== filtroEmpresa) return false
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  })

  return (
    <div>
      <PageHeader
        titulo="Plano de Contas"
        subtitulo="Contas de resultado (DRE) e patrimoniais (Balanço) — cada empresa tem o seu plano"
        acao={
          isAdmin ? (
            <button onClick={abrirNovo} className={btnPrimario}>
              <Plus size={16} /> Nova conta
            </button>
          ) : undefined
        }
      />

      <ErroBanner mensagem={erro} />

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Buscar por código ou nome…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className={inputCls + ' max-w-xs'}
        />
        <select className={inputCls + ' max-w-[15rem]'} value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)}>
          <option value="todas">Todas as empresas</option>
          {empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.name}</option>)}
        </select>
        <select className={inputCls + ' max-w-[12rem]'} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as ChartAccountType | 'todos')}>
          <option value="todos">Resultado + Patrimonial</option>
          <option value="resultado">Somente resultado</option>
          <option value="patrimonial">Somente patrimonial</option>
        </select>
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
                  <th className="text-left px-4 py-3 font-medium text-fg-muted whitespace-nowrap">Tipo contábil</th>
                  <th className="text-left px-4 py-3 font-medium text-fg-muted whitespace-nowrap">Empresa</th>
                  <th className="text-left px-4 py-3 font-medium text-fg-muted whitespace-nowrap">Estrutura</th>
                  <th className="text-left px-4 py-3 font-medium text-fg-muted whitespace-nowrap">Produto DRE</th>
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
                        <Badge tom={c.tipo === 'patrimonial' ? 'warning' : 'brand'}>
                          {c.tipo === 'patrimonial' ? 'Patrimonial' : 'Resultado'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-fg-muted">
                        {c.company_id ? empresas.find((empresa) => empresa.id === c.company_id)?.name ?? 'Empresa' : 'Compartilhada'}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Badge tom={isGrupo ? 'muted' : 'brand'}>{isGrupo ? 'Grupo' : 'Analítica'}</Badge>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {c.tipo === 'patrimonial'
                          ? <span className="text-xs text-fg-subtle">—</span>
                          : c.dre_product_id
                          ? <Badge tom="revenue">{produtos.find((p) => p.id === c.dre_product_id)?.name ?? 'produto'}</Badge>
                          : rateioPadrao(c.nature)
                            ? <span className="text-xs text-warning">a classificar</span>
                            : <span className="text-xs text-fg-subtle">—</span>}
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
                onChange={(e) => setForm({ ...form, code: e.target.value, sort_order: String(ordemDoCodigo(e.target.value)) })}
                placeholder="ex: 3.1.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ordem</label>
              <input
                type="number"
                readOnly
                tabIndex={-1}
                className={inputCls + ' opacity-60 cursor-not-allowed'}
                value={form.sort_order}
                title="Calculada automaticamente a partir do código"
              />
              <p className="text-xs text-fg-subtle mt-1">Calculada do código — não precisa preencher.</p>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo contábil *</label>
              <select
                required
                className={inputCls}
                value={form.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as ChartAccountType
                  setForm({
                    ...form,
                    tipo,
                    nature: tipo === 'patrimonial' ? 'asset' : 'revenue',
                    company_id: tipo === 'patrimonial' && !form.company_id ? empresaAtiva?.id ?? empresas[0]?.id ?? '' : form.company_id,
                    parent_id: '',
                    dre_product_id: '',
                    redutora: false,
                  })
                }}
              >
                <option value="resultado">Resultado — entra na DRE</option>
                <option value="patrimonial">Patrimonial — fora da DRE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Empresa *</label>
              <select
                required
                className={inputCls}
                value={form.company_id}
                onChange={(e) => setForm({ ...form, company_id: e.target.value, parent_id: '' })}
              >
                <option value="">Selecione…</option>
                {empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.name}</option>)}
              </select>
            </div>
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
              {(form.tipo === 'patrimonial' ? PATRIMONIAL_NATURES : RESULT_NATURES).map((value) => (
                <option key={value} value={value}>{NATURE_LABELS[value]}</option>
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
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded border-border-strong text-brand focus:ring-brand"
              />
              Ativa
            </label>

            {form.tipo === 'patrimonial' && (
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input
                  type="checkbox"
                  checked={form.redutora}
                  onChange={(e) => setForm({ ...form, redutora: e.target.checked })}
                  className="rounded border-border-strong text-brand focus:ring-brand"
                />
                Conta redutora
              </label>
            )}
          </div>

          {/* Produto DRE: só faz sentido acima da margem (receita/dedução/custo variável).
              A receita lançada nesta conta cai neste produto na DRE por Produto. */}
          {form.tipo === 'resultado' && rateioPadrao(form.nature) && (
            <div>
              <label className="block text-sm font-medium mb-1">Produto DRE</label>
              <select
                className={inputCls}
                value={form.dre_product_id}
                onChange={(e) => setForm({ ...form, dre_product_id: e.target.value })}
              >
                <option value="">— Nenhum (cai em "A classificar") —</option>
                {produtos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-xs text-fg-subtle mt-1">
                A receita/custo lançado nesta conta aparece neste produto na DRE por Produto (o lançamento ainda pode sobrepor manualmente). Contas de estrutura (despesas fixas/financeiro/impostos) não têm produto — vão pra coluna Total.
              </p>
            </div>
          )}

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
