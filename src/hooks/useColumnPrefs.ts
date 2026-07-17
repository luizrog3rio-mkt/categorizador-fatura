import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
  OnChangeFn,
} from '@tanstack/react-table'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'

// Preferências de coluna (ordem, larguras, visibilidade) por usuário×tabela.
// Estratégia: hidrata SÍNCRONO do localStorage (pinta instantâneo), carrega do
// Supabase no mount e reconcilia, e persiste com debounce (o debounce também
// resolve "salvar só no fim do resize" — durante o arraste os onChange só
// disparam o save 600ms depois do último). Fonte da verdade = Supabase.

interface PrefsConfig {
  v: number
  order?: ColumnOrderState
  sizing?: ColumnSizingState
  visibility?: VisibilityState
}

const lsKey = (tableKey: string) => `tprefs:${tableKey}`

function readLocal(tableKey: string): PrefsConfig | null {
  try {
    const raw = localStorage.getItem(lsKey(tableKey))
    return raw ? (JSON.parse(raw) as PrefsConfig) : null
  } catch {
    return null
  }
}

function writeLocal(tableKey: string, cfg: PrefsConfig) {
  try {
    localStorage.setItem(lsKey(tableKey), JSON.stringify(cfg))
  } catch {
    /* quota/SSR — ignora */
  }
}

export interface ColumnPrefs {
  columnOrder: ColumnOrderState
  columnSizing: ColumnSizingState
  columnVisibility: VisibilityState
  onColumnOrderChange: OnChangeFn<ColumnOrderState>
  onColumnSizingChange: OnChangeFn<ColumnSizingState>
  onColumnVisibilityChange: OnChangeFn<VisibilityState>
  loaded: boolean
  reset: () => void
}

export function useColumnPrefs(tableKey: string): ColumnPrefs {
  const { session } = useApp()
  const userId = session?.user.id

  const inicial = readLocal(tableKey)
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(inicial?.order ?? [])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(inicial?.sizing ?? {})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(inicial?.visibility ?? {})
  const [loaded, setLoaded] = useState(false)

  // refs sempre atuais pra montar o config no save sem fechar sobre estado velho
  const orderRef = useRef(columnOrder)
  const sizingRef = useRef(columnSizing)
  const visRef = useRef(columnVisibility)
  const loadedRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // carrega do servidor (e reconcilia) quando muda usuário/tabela
  useEffect(() => {
    let cancel = false
    // Inicia uma nova hidratação externa ao trocar usuário ou tabela.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false)
    loadedRef.current = false
    if (!userId) {
      setLoaded(true)
      loadedRef.current = true
      return
    }
    supabase
      .from('user_table_prefs')
      .select('config')
      .eq('table_key', tableKey)
      .maybeSingle()
      .then(({ data }) => {
        if (cancel) return
        const cfg = data?.config as PrefsConfig | undefined
        if (cfg) {
          if (cfg.order) { setColumnOrder(cfg.order); orderRef.current = cfg.order }
          if (cfg.sizing) { setColumnSizing(cfg.sizing); sizingRef.current = cfg.sizing }
          if (cfg.visibility) { setColumnVisibility(cfg.visibility); visRef.current = cfg.visibility }
          writeLocal(tableKey, cfg)
        }
        setLoaded(true)
        loadedRef.current = true
      })
    return () => { cancel = true }
  }, [userId, tableKey])

  const agendarSave = useCallback(() => {
    if (!loadedRef.current) return // não re-salva durante a hidratação
    const cfg: PrefsConfig = {
      v: 1,
      order: orderRef.current,
      sizing: sizingRef.current,
      visibility: visRef.current,
    }
    writeLocal(tableKey, cfg)
    if (!userId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      supabase
        .from('user_table_prefs')
        .upsert(
          { user_id: userId, table_key: tableKey, config: cfg, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,table_key' }
        )
        .then(() => {})
    }, 600)
  }, [tableKey, userId])

  // limpa o timer pendente ao desmontar
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const onColumnOrderChange: OnChangeFn<ColumnOrderState> = useCallback((updater) => {
    setColumnOrder((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      orderRef.current = next
      agendarSave()
      return next
    })
  }, [agendarSave])

  const onColumnSizingChange: OnChangeFn<ColumnSizingState> = useCallback((updater) => {
    setColumnSizing((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      sizingRef.current = next
      agendarSave()
      return next
    })
  }, [agendarSave])

  const onColumnVisibilityChange: OnChangeFn<VisibilityState> = useCallback((updater) => {
    setColumnVisibility((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      visRef.current = next
      agendarSave()
      return next
    })
  }, [agendarSave])

  const reset = useCallback(() => {
    setColumnOrder([]); orderRef.current = []
    setColumnSizing({}); sizingRef.current = {}
    setColumnVisibility({}); visRef.current = {}
    try { localStorage.removeItem(lsKey(tableKey)) } catch { /* ignora */ }
    if (userId) {
      supabase.from('user_table_prefs').delete().eq('table_key', tableKey).then(() => {})
    }
  }, [tableKey, userId])

  return {
    columnOrder,
    columnSizing,
    columnVisibility,
    onColumnOrderChange,
    onColumnSizingChange,
    onColumnVisibilityChange,
    loaded,
    reset,
  }
}
