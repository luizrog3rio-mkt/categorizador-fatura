// O prefetch só dispara o import() (esquenta o chunk) — nunca instancia o
// componente — então o tipo do default export é irrelevante aqui.
type Loader = () => Promise<unknown>

// Thunks de import() das páginas, por caminho de rota. Mesma especificação de
// módulo que o lazy() do App resolve → o Vite dedupa no MESMO chunk, então
// chamar o loader no hover do menu "esquenta" o chunk que a rota vai usar.
// (As rotas /pagar e /receber compartilham a página Lancamentos = mesmo chunk.)
const pageLoaders: Record<string, Loader> = {
  '/': () => import('../pages/Dashboard'),
  '/faturas': () => import('../pages/Faturas'),
  '/compras': () => import('../pages/Compras'),
  '/pagar': () => import('../pages/Lancamentos'),
  '/receber': () => import('../pages/Lancamentos'),
  '/transferencias': () => import('../pages/Transferencias'),
  '/extrato': () => import('../pages/Extrato'),
  '/conciliacao': () => import('../pages/Conciliacao'),
  '/hotmart': () => import('../pages/Hotmart'),
  '/produtos-hotmart': () => import('../pages/ProdutosHotmart'),
  // Origens: o hover no item do menu esquenta o shell + a aba default (classificar)
  '/origens': () => Promise.all([import('../pages/origens/OrigensLayout'), import('../pages/origens/AbaClassificar')]),
  '/origens/classificar': () => import('../pages/origens/AbaClassificar'),
  '/origens/regras': () => import('../pages/origens/AbaRegras'),
  '/origens/vendedores': () => import('../pages/origens/AbaVendedores'),
  // rotas antigas (redirect) — mesmo chunk das abas, prefetch não fura
  '/classificar': () => import('../pages/origens/AbaClassificar'),
  '/regras': () => import('../pages/origens/AbaRegras'),
  '/vendedores': () => import('../pages/origens/AbaVendedores'),
  '/contas': () => import('../pages/Contas'),
  '/dre': () => import('../pages/DRE'),
  '/dre-produto': () => import('../pages/DreProduto'),
  '/empresas': () => import('../pages/Empresas'),
  '/usuarios': () => import('../pages/Usuarios'),
  '/plano-de-contas': () => import('../pages/PlanoDeContas'),
  '/produtos-dre': () => import('../pages/DreProducts'),
  '/periodos-fechados': () => import('../pages/PeriodosFechados'),
  '/conciliacao-dre': () => import('../pages/ConciliacaoDRE'),
  '/classificar-despesas': () => import('../pages/ClassificarDespesas'),
  '/custo-por-obra': () => import('../pages/CustoPorObra'),
}

// Dispara o import() da rota (idempotente — o browser/Vite dedupa a requisição).
const prefetched = new Set<string>()
export function prefetchPage(path: string) {
  if (prefetched.has(path)) return
  const loader = pageLoaders[path]
  if (!loader) return
  prefetched.add(path)
  loader().catch(() => prefetched.delete(path)) // se falhar, permite tentar de novo
}
