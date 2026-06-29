import { lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider, useApp } from './contexts/AppContext'
import Layout from './components/Layout'
import Login from './pages/Login'

// Todas as páginas são lazy: cada rota vira um chunk próprio e sai do bundle
// inicial (que fica só com framework + shell + Login). O Suspense que cobre as
// rotas vive no Layout, em volta do <Outlet/>. xlsx é import() dinâmico (carrega
// no export) e recharts cai nos chunks lazy de Dashboard/Relatório.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Faturas = lazy(() => import('./pages/Faturas'))
const Fatura = lazy(() => import('./pages/Fatura'))
const Compras = lazy(() => import('./pages/Compras'))
const Lancamentos = lazy(() => import('./pages/Lancamentos'))
const Transferencias = lazy(() => import('./pages/Transferencias'))
const Extrato = lazy(() => import('./pages/Extrato'))
const Hotmart = lazy(() => import('./pages/Hotmart'))
const ProdutosHotmart = lazy(() => import('./pages/ProdutosHotmart'))
const Vendedores = lazy(() => import('./pages/Vendedores'))
const Regras = lazy(() => import('./pages/Regras'))
const Contas = lazy(() => import('./pages/Contas'))
const DRE = lazy(() => import('./pages/DRE'))
const DreProduto = lazy(() => import('./pages/DreProduto'))
const Conciliacao = lazy(() => import('./pages/Conciliacao'))
const Empresas = lazy(() => import('./pages/Empresas'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const PlanoDeContas = lazy(() => import('./pages/PlanoDeContas'))
const DreProducts = lazy(() => import('./pages/DreProducts'))
const PeriodosFechados = lazy(() => import('./pages/PeriodosFechados'))
const ConciliacaoDRE = lazy(() => import('./pages/ConciliacaoDRE'))

function Rotas() {
  const { session, carregando } = useApp()

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center text-fg-subtle">
        Carregando…
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/faturas" element={<Faturas />} />
        <Route path="/faturas/:id" element={<Fatura />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/pagar" element={<Lancamentos key="payable" tipo="payable" />} />
        <Route path="/receber" element={<Lancamentos key="receivable" tipo="receivable" />} />
        <Route path="/transferencias" element={<Transferencias />} />
        <Route path="/extrato" element={<Extrato />} />
        <Route path="/conciliacao" element={<Conciliacao />} />
        <Route path="/hotmart" element={<Hotmart />} />
        <Route path="/produtos-hotmart" element={<ProdutosHotmart />} />
        <Route path="/vendedores" element={<Vendedores />} />
        <Route path="/regras" element={<Regras />} />
        <Route path="/contas" element={<Contas />} />
        <Route path="/dre" element={<DRE />} />
        <Route path="/dre-produto" element={<DreProduto />} />
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
