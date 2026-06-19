import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

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
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
          <RefreshCw size={30} />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-1.5">Nova versão disponível</h2>
        <p className="text-sm text-slate-500 mb-6">
          Saiu uma atualização do sistema. Recarregue a página para usar a versão mais recente.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-4 py-3 transition"
        >
          <RefreshCw size={18} /> Atualizar agora
        </button>
        <button
          onClick={() => setDispensado(true)}
          className="mt-3 text-sm text-slate-400 hover:text-slate-600 transition"
        >
          Agora não
        </button>
      </div>
    </div>
  )
}
