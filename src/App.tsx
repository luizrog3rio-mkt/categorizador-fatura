import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider, useApp } from './contexts/AppContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Contas from './pages/Contas'
import Faturas from './pages/Faturas'
import Fatura from './pages/Fatura'
import Compras from './pages/Compras'
import Lancamentos from './pages/Lancamentos'
import Extrato from './pages/Extrato'
import Hotmart from './pages/Hotmart'
import Categorias from './pages/Categorias'
import Empresas from './pages/Empresas'
import Usuarios from './pages/Usuarios'
import DRE from './pages/DRE'
import Conciliacao from './pages/Conciliacao'
import PlanoDeContas from './pages/PlanoDeContas'
import DreProducts from './pages/DreProducts'
import PeriodosFechados from './pages/PeriodosFechados'
import ConciliacaoDRE from './pages/ConciliacaoDRE'

// Dashboard e Relatório carregam o recharts (centenas de kB) — lazy tira do bundle inicial
const Dashboard = lazy(() => import('./pages/Dashboard'))
const RelatorioCategorias = lazy(() => import('./pages/RelatorioCategorias'))

function Rotas() {
  const { session, carregando } = useApp()

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Carregando…
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path="/"
          element={
            <Suspense fallback={<div className="text-slate-400 text-sm p-8">Carregando…</div>}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route path="/faturas" element={<Faturas />} />
        <Route path="/faturas/:id" element={<Fatura />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/pagar" element={<Lancamentos key="payable" tipo="payable" />} />
        <Route path="/receber" element={<Lancamentos key="receivable" tipo="receivable" />} />
        <Route path="/extrato" element={<Extrato />} />
        <Route path="/conciliacao" element={<Conciliacao />} />
        <Route path="/hotmart" element={<Hotmart />} />
        <Route path="/contas" element={<Contas />} />
        <Route
          path="/relatorio-categorias"
          element={
            <Suspense fallback={<div className="text-slate-400 text-sm p-8">Carregando…</div>}>
              <RelatorioCategorias />
            </Suspense>
          }
        />
        <Route path="/dre" element={<DRE />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/plano-de-contas" element={<PlanoDeContas />} />
        <Route path="/produtos-dre" element={<DreProducts />} />
        <Route path="/periodos-fechados" element={<PeriodosFechados />} />
        <Route path="/conciliacao-dre" element={<ConciliacaoDRE />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Rotas />
      </AppProvider>
    </BrowserRouter>
  )
}
