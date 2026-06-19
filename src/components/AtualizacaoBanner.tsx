import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

// Avisa quando saiu um deploy novo (a SPA segura o bundle antigo até dar F5).
// Compara os assets hasheados do /index.html do servidor com os que estão
// rodando agora; se mudaram, mostra um banner com botão Atualizar. Só em
// produção (em dev o index não tem /assets/ hasheado). ?previewUpdate=1 força
// o banner pra dar pra ver o visual.

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

export default function AtualizacaoBanner() {
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
    <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-xl bg-slate-900 text-white shadow-lg ring-1 ring-black/10 pl-4 pr-3 py-3">
      <RefreshCw size={16} className="text-indigo-300 shrink-0" />
      <div className="text-sm">
        <span className="font-semibold">Nova versão disponível</span>
        <span className="text-slate-300"> — atualize para ver as novidades.</span>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 transition"
      >
        Atualizar
      </button>
      <button
        onClick={() => setDispensado(true)}
        className="text-slate-400 hover:text-white p-1 rounded transition"
        title="Agora não"
      >
        <X size={16} />
      </button>
    </div>
  )
}
