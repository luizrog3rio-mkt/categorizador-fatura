import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import { prefetchPage } from '../../lib/routePrefetch'

// Shell da página "Origens" — funde as 3 telas do fluxo de origem (Classificar +
// Regras + Vendedores) numa única página com abas. As abas são ROTAS-FILHAS reais
// (react-router): deep-link, code-splitting/prefetch por chunk, estado-ativo do menu
// e isolamento de estado (a aba inativa desmonta) saem nativos. O shell não segura
// estado nem carregar() — cada aba é um componente lazy que mantém sua própria lógica.

const ABAS = [
  { to: '/origens/classificar', seg: 'classificar', rotulo: 'A classificar' },
  { to: '/origens/regras', seg: 'regras', rotulo: 'Regras' },
  { to: '/origens/vendedores', seg: 'vendedores', rotulo: 'Vendedores' },
]

const SUBTITULOS: Record<string, string> = {
  classificar: 'Os valores de tracking ainda a classificar, por volume. Crie uma regra a partir do topo — cada regra classifica todas as vendas que casam (e as futuras).',
  regras: 'Condições (src / sck / xcode / afiliado) que classificam as vendas automaticamente. Comercial é por vendedor; os demais grupos são por origem.',
  vendedores: 'Cadastre os vendedores e acompanhe as vendas atribuídas a cada um. A atribuição de cada venda é feita pelas regras.',
}

export default function OrigensLayout() {
  // subtítulo derivado puro do último segmento da rota (sem state/effect)
  const seg = useLocation().pathname.split('/')[2] ?? 'classificar'

  return (
    <div className="space-y-6">
      <PageHeader titulo="Origens" subtitulo={SUBTITULOS[seg] ?? SUBTITULOS.classificar} />

      <div className="flex items-center gap-1 flex-wrap border-b border-border">
        {ABAS.map((a) => (
          <NavLink
            key={a.seg}
            to={a.to}
            onMouseEnter={() => prefetchPage(a.to)}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${isActive ? 'border-brand text-brand' : 'border-transparent text-fg-muted hover:text-fg'}`
            }
          >
            {a.rotulo}
          </NavLink>
        ))}
      </div>

      <Suspense fallback={<p className="text-sm text-fg-subtle px-1">Carregando…</p>}>
        <Outlet />
      </Suspense>
    </div>
  )
}
