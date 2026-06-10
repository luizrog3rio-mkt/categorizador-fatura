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
  Tags,
  LogOut,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'

const itens = [
  { to: '/', rotulo: 'Dashboard', icone: LayoutDashboard },
  { to: '/faturas', rotulo: 'Faturas de Cartão', icone: ReceiptText },
  { to: '/compras', rotulo: 'Compras', icone: ShoppingBag },
  { to: '/pagar', rotulo: 'Contas a Pagar', icone: ArrowDownCircle },
  { to: '/receber', rotulo: 'Contas a Receber', icone: ArrowUpCircle },
  { to: '/extrato', rotulo: 'Extratos (OFX)', icone: FileDown },
  { to: '/hotmart', rotulo: 'Hotmart', icone: ShoppingCart },
  { to: '/contas', rotulo: 'Contas & Cartões', icone: Landmark },
  { to: '/categorias', rotulo: 'Categorias', icone: Tags },
]

export default function Layout() {
  const { perfil, empresas, empresaAtiva, setEmpresaAtiva, pendingCount } = useApp()

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-900 text-slate-200 flex flex-col fixed inset-y-0">
        <div className="px-5 py-5 border-b border-slate-800">
          <h1 className="text-lg font-bold text-white">💳 RB7 Financeiro</h1>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{perfil?.email}</p>
        </div>
        {empresas.length > 1 && (
          <div className="px-4 py-3 border-b border-slate-800">
            <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">
              Empresa
            </label>
            <select
              value={empresaAtiva?.id ?? ''}
              onChange={(e) =>
                setEmpresaAtiva(empresas.find((emp) => emp.id === e.target.value) ?? null)
              }
              className="w-full bg-slate-800 text-sm rounded-lg px-2 py-1.5 border border-slate-700"
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
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {itens.map(({ to, rotulo, icone: Icone }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'
                }`
              }
            >
              <Icone size={17} />
              <span className="flex-1">{rotulo}</span>
              {to === '/compras' && pendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-blue-500 text-white text-[11px] font-bold">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-3 px-6 py-4 text-sm text-slate-400 hover:text-white border-t border-slate-800"
        >
          <LogOut size={16} /> Sair
        </button>
      </aside>
      <main className="flex-1 ml-60 p-6">
        <Outlet />
      </main>
    </div>
  )
}
