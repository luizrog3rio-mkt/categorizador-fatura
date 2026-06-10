/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Company, Profile } from '../lib/types'

interface AppCtx {
  session: Session | null
  carregando: boolean
  perfil: Profile | null
  empresas: Company[]
  empresaAtiva: Company | null // null = consolidado (todas)
  setEmpresaAtiva: (e: Company | null) => void
  recarregarEmpresas: () => Promise<void>
}

const Ctx = createContext<AppCtx>(null as unknown as AppCtx)

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [perfil, setPerfil] = useState<Profile | null>(null)
  const [empresas, setEmpresas] = useState<Company[]>([])
  const [empresaAtiva, setEmpresaAtiva] = useState<Company | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const recarregarEmpresas = async () => {
    const { data, error } = await supabase.from('companies').select('*').order('name')
    if (error) console.error('Erro carregando companies:', error.message)
    setEmpresas(data ?? [])
  }

  useEffect(() => {
    if (!session) return
    recarregarEmpresas()
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('Erro carregando profile:', error.message)
        setPerfil(data)
      })
  }, [session])

  return (
    <Ctx.Provider
      value={{ session, carregando, perfil, empresas, empresaAtiva, setEmpresaAtiva, recarregarEmpresas }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)
