import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  ReceiptText,
  ShoppingBag,
  ArrowDownCircle,
  ArrowUpCircle,
  Landmark,
  FileDown,
  ShoppingCart,
  Building2,
  Users,
  Scale,
  Link2,
  LogOut,
  BookOpen,
  Tag,
  Lock,
  ArrowLeftRight,
  Shuffle,
  Filter,
  Boxes,
  GitCompare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { prefetchPage } from '../lib/routePrefetch'
import AtualizacaoModal from './AtualizacaoModal'

type Item = { to: string; rotulo: string; icone: LucideIcon }
type Grupo = { titulo: string; itens: Item[] }

// Navegação por domínio: 18 alvos planos → 7 seções escaneáveis.
const grupos: Grupo[] = [
  {
    titulo: 'Visão geral',
    itens: [{ to: '/', rotulo: 'Dashboard', icone: LayoutDashboard }],
  },
  {
    titulo: 'Cartão & Compras',
    itens: [
      { to: '/faturas', rotulo: 'Faturas de Cartão', icone: ReceiptText },
      { to: '/compras', rotulo: 'Compras pendentes', icone: ShoppingBag },
    ],
  },
  {
    titulo: 'Contas & Caixa',
    itens: [
      { to: '/pagar', rotulo: 'Contas a Pagar', icone: ArrowDownCircle },
      { to: '/receber', rotulo: 'Contas a Receber', icone: ArrowUpCircle },
      { to: '/transferencias', rotulo: 'Transferências', icone: ArrowLeftRight },
      { to: '/extrato', rotulo: 'Extratos (OFX)', icone: FileDown },
      { to: '/conciliacao', rotulo: 'Conciliação Bancária', icone: Link2 },
    ],
  },
  {
    titulo: 'Receitas & Vendas',
    itens: [
      { to: '/hotmart', rotulo: 'Hotmart', icone: ShoppingCart },
      { to: '/produtos-hotmart', rotulo: 'Mapear produtos', icone: Shuffle },
      { to: '/origens', rotulo: 'Origens', icone: Filter },
    ],
  },
  {
    titulo: 'DRE & Relatórios',
    itens: [
      { to: '/dre', rotulo: 'DRE', icone: Scale },
      { to: '/dre-produto', rotulo: 'DRE por Produto', icone: Boxes },
      { to: '/conciliacao-dre', rotulo: 'DRE × Caixa', icone: GitCompare },
      { to: '/periodos-fechados', rotulo: 'Períodos Fechados', icone: Lock },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { to: '/empresas', rotulo: 'Empresas', icone: Building2 },
      { to: '/contas', rotulo: 'Contas & Cartões', icone: Landmark },
      { to: '/plano-de-contas', rotulo: 'Plano de Contas', icone: BookOpen },
      { to: '/produtos-dre', rotulo: 'Produtos DRE', icone: Tag },
    ],
  },
]

const itemCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 h-9 px-3 rounded-control text-sm transition ${
    isActive ? 'bg-brand-subtle text-brand font-medium' : 'text-fg-muted hover:bg-surface-2'
  }`

export default function Layout() {
  const { perfil, isAdmin, empresas, empresaAtiva, setEmpresaAtiva, pendingCount } = useApp()

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-surface border-r border-border flex flex-col fixed inset-y-0">
        {/* marca */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center w-8 h-8 rounded-control bg-brand text-white font-bold text-sm tracking-tight shrink-0">
              R
            </div>
            <div className="leading-tight min-w-0">
              <p className="font-bold text-fg tracking-tight">RB7 Financeiro</p>
              <p className="text-xs text-fg-subtle truncate">{perfil?.email}</p>
            </div>
          </div>
        </div>

        {/* seletor de empresa */}
        {empresas.length > 1 && (
          <div className="px-3 py-3 border-b border-border">
            <label className="block text-[11px] uppercase tracking-wide text-fg-subtle mb-1 px-1">
              Empresa
            </label>
            <select
              value={empresaAtiva?.id ?? ''}
              onChange={(e) =>
                setEmpresaAtiva(empresas.find((emp) => emp.id === e.target.value) ?? null)
              }
              className="w-full rounded-control border border-border-strong bg-surface text-sm px-2 py-1.5 text-fg focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">Consolidado (todas)</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* navegação por grupos */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          {grupos.map((grupo) => (
            <div key={grupo.titulo} className="mt-4 first:mt-1">
              <p className="px-3 mb-1 text-[11px] font-semibold tracking-wide uppercase text-fg-subtle">
                {grupo.titulo}
              </p>
              <div className="space-y-0.5">
                {grupo.itens.map(({ to, rotulo, icone: Icone }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={itemCls}
                    onMouseEnter={() => prefetchPage(to)}
                    onFocus={() => prefetchPage(to)}
                  >
                    <Icone size={18} className="shrink-0" />
                    <span className="flex-1 truncate">{rotulo}</span>
                    {to === '/compras' && pendingCount > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-brand text-white text-[11px] font-semibold tnum">
                        {pendingCount}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}

          {isAdmin && (
            <div className="mt-4">
              <p className="px-3 mb-1 text-[11px] font-semibold tracking-wide uppercase text-fg-subtle">
                Admin
              </p>
              <NavLink
                to="/usuarios"
                className={itemCls}
                onMouseEnter={() => prefetchPage('/usuarios')}
                onFocus={() => prefetchPage('/usuarios')}
              >
                <Users size={18} className="shrink-0" />
                <span className="flex-1 truncate">Usuários</span>
              </NavLink>
            </div>
          )}
        </nav>

        {/* rodapé */}
        <div className="border-t border-border">
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-3 w-full px-5 py-3 text-sm text-fg-muted hover:bg-surface-2 transition"
          >
            <LogOut size={16} /> Sair
          </button>
          <p className="px-5 pb-2.5 text-[10px] text-fg-subtle">versão {__APP_VERSION__}</p>
        </div>
      </aside>

      <main className="flex-1 min-w-0 ml-64">
        <div className="max-w-[1760px] mx-auto px-6 py-6">
          <Suspense fallback={<div className="text-fg-subtle text-sm p-8">Carregando…</div>}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <AtualizacaoModal />
    </div>
  )
}
