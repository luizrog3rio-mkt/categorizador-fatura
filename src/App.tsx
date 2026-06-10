import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider, useApp } from './contexts/AppContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Contas from './pages/Contas'
import Faturas from './pages/Faturas'
import Fatura from './pages/Fatura'
import Compras from './pages/Compras'
import EmConstrucao from './pages/EmConstrucao'

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
        <Route path="/" element={<EmConstrucao titulo="Dashboard" etapa="etapa 7" />} />
        <Route path="/faturas" element={<Faturas />} />
        <Route path="/faturas/:id" element={<Fatura />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/pagar" element={<EmConstrucao titulo="Contas a Pagar" etapa="etapa 4" />} />
        <Route path="/receber" element={<EmConstrucao titulo="Contas a Receber" etapa="etapa 4" />} />
        <Route path="/extrato" element={<EmConstrucao titulo="Extratos (OFX)" etapa="etapa 5" />} />
        <Route path="/hotmart" element={<EmConstrucao titulo="Hotmart" etapa="etapa 6" />} />
        <Route path="/contas" element={<Contas />} />
        <Route path="/categorias" element={<EmConstrucao titulo="Categorias" etapa="etapa 8" />} />
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
