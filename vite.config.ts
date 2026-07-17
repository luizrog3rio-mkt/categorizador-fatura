import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// versão do build: SHA curto do commit (Vercel) ou 'dev' no local
const versao = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(versao),
  },
  // testes: funções puras de matemática de dinheiro (parsers/sinal/datas) rodam em
  // 'node' sem jsdom. NÃO importar ./supabase em código testado aqui.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/entries.ts',
        'src/lib/fatura.ts',
        'src/lib/format.ts',
        'src/lib/hotmart.ts',
        'src/lib/importarExtrato.ts',
        'src/lib/importarFatura.ts',
        'src/lib/ofxExtrato.ts',
        'src/lib/regra.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 60,
        functions: 85,
        lines: 90,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // framework + supabase num chunk cacheável: mudam pouco, então um deploy
        // novo (só código de app) não invalida o download deles no cliente.
        // recharts/xlsx seguem nos próprios chunks (lazy / import dinâmico).
        // Forma-função (o rolldown tipa manualChunks como função, não objeto).
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'supabase'
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          )
            return 'react-vendor'
        },
      },
    },
  },
})
