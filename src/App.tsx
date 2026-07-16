import { lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './contexts/AppContext'
import { ToastProvider } from './components/Toast'
import { ConfirmProvider } from './components/Confirm'
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
const OrigensLayout = lazy(() => import('./pages/origens/OrigensLayout'))
const AbaClassificar = lazy(() => import('./pages/origens/AbaClassificar'))
const AbaRegras = lazy(() => import('./pages/origens/AbaRegras'))
const AbaVendedores = lazy(() => import('./pages/origens/AbaVendedores'))
const Contas = lazy(() => import('./pages/Contas'))
const DRE = lazy(() => import('./pages/DRE'))
const DreProduto = lazy(() => import('./pages/DreProduto'))
const Conciliacao = lazy(() => import('./pages/Conciliacao'))
const Empresas = lazy(() => import('./pages/Empresas'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const PlanoDeContas = lazy(() => import('./pages/PlanoDeContas'))
const DreProducts = lazy(() => import('./pages/DreProducts'))
const PeriodosFechados = lazy(() => import('./pages/PeriodosFechados'))
const Delecoes = lazy(() => import('./pages/Delecoes'))
const ConciliacaoDRE = lazy(() => import('./pages/ConciliacaoDRE'))
const ClassificarDespesas = lazy(() => import('./pages/ClassificarDespesas'))
const CustoPorObra = lazy(() => import('./pages/CustoPorObra'))

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
        <Route path="/origens" element={<OrigensLayout />}>
          <Route index element={<Navigate to="classificar" replace />} />
          <Route path="classificar" element={<AbaClassificar />} />
          <Route path="regras" element={<AbaRegras />} />
          <Route path="vendedores" element={<AbaVendedores />} />
        </Route>
        {/* redirects das rotas antigas (replace = ~301 numa SPA, cobre bookmarks) */}
        <Route path="/classificar" element={<Navigate to="/origens/classificar" replace />} />
        <Route path="/regras" element={<Navigate to="/origens/regras" replace />} />
        <Route path="/vendedores" element={<Navigate to="/origens/vendedores" replace />} />
        <Route path="/contas" element={<Contas />} />
        <Route path="/dre" element={<DRE />} />
        <Route path="/dre-produto" element={<DreProduto />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/plano-de-contas" element={<PlanoDeContas />} />
        <Route path="/produtos-dre" element={<DreProducts />} />
        <Route path="/periodos-fechados" element={<PeriodosFechados />} />
        <Route path="/delecoes" element={<Delecoes />} />
        <Route path="/conciliacao-dre" element={<ConciliacaoDRE />} />
        <Route path="/classificar-despesas" element={<ClassificarDespesas />} />
        <Route path="/custo-por-obra" element={<CustoPorObra />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Rotas />
          </ConfirmProvider>
        </ToastProvider>
      </AppProvider>
    </BrowserRouter>
  )
}
