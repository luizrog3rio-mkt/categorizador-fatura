import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider, useApp } from './contexts/AppContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Contas from './pages/Contas'
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
        <Route path="/faturas" element={<EmConstrucao titulo="Faturas de Cartão" etapa="etapa 2" />} />
        <Route path="/compras" element={<EmConstrucao titulo="Compras" etapa="etapa 3" />} />
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
