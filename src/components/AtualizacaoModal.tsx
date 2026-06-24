import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from './ui'

// Avisa quando saiu um deploy novo (a SPA segura o bundle antigo até dar F5).
// Compara os assets hasheados do /index.html do servidor com os que estão
// rodando agora; se mudaram, mostra um MODAL central com botão Atualizar. Só em
// produção (em dev o index não tem /assets/ hasheado). ?previewUpdate=1 força
// o modal pra dar pra ver o visual.

const INTERVALO_MS = 60_000

// assets (js/css hasheados) referenciados num HTML — marcador da versão
function assetsDoHtml(html: string): string {
  const urls = [...html.matchAll(/\/assets\/[\w.-]+\.(?:js|css)/g)].map((m) => m[0])
  return [...new Set(urls)].sort().join('|')
}

// assets que ESTE documento (a versão rodando) carregou
function assetsRodando(): string {
  const els = [
    ...document.querySelectorAll('script[src]'),
    ...document.querySelectorAll('link[href]'),
  ]
  const urls = els
    .map((e) => e.getAttribute('src') || e.getAttribute('href') || '')
    .filter((u) => u.includes('/assets/'))
  return [...new Set(urls)].sort().join('|')
}

export default function AtualizacaoModal() {
  const forcar = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('previewUpdate')
  const [novaVersao, setNovaVersao] = useState(forcar)
  const [dispensado, setDispensado] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD || forcar) return
    const atual = assetsRodando()
    let achou = false

    const checar = async () => {
      if (achou) return
      try {
        const res = await fetch('/index.html', { cache: 'no-store' })
        if (!res.ok) return
        const servidor = assetsDoHtml(await res.text())
        if (servidor && atual && servidor !== atual) {
          achou = true
          setNovaVersao(true)
        }
      } catch {
        // offline / erro de rede: ignora, tenta de novo no próximo ciclo
      }
    }

    const id = setInterval(checar, INTERVALO_MS)
    const aoVoltar = () => { if (document.visibilityState === 'visible') checar() }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [forcar])

  if (!novaVersao || dispensado) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-fg/40 backdrop-blur-sm" />
      <div className="relative bg-surface rounded-modal shadow-pop w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-brand-subtle flex items-center justify-center text-brand">
          <RefreshCw size={30} />
        </div>
        <h2 className="text-xl font-bold text-fg mb-1.5">Nova versão disponível</h2>
        <p className="text-sm text-fg-muted mb-6">
          Saiu uma atualização do sistema. Recarregue a página para usar a versão mais recente.
        </p>
        <Button
          variante="primary"
          onClick={() => window.location.reload()}
          className="w-full py-3"
        >
          <RefreshCw size={18} /> Atualizar agora
        </Button>
        <button
          onClick={() => setDispensado(true)}
          className="mt-3 text-sm text-fg-subtle hover:text-fg-muted transition"
        >
          Agora não
        </button>
      </div>
    </div>
  )
}
