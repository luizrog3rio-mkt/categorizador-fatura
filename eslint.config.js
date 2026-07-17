import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // supabase/functions roda em Deno (Edge Function) — fora da config web
  globalIgnores(['dist', 'supabase/functions']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // O app usa fetch-on-mount (carregar() dentro de useEffect) em todas as
      // páginas; rebaixado para warn até migrar para um padrão de data-fetching.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // As páginas sincronizam a UI com o Supabase chamando um loader assíncrono
    // no mount/troca de filtros. A regra não distingue esse fetch-on-mount de um
    // setState derivável durante render; os componentes compartilhados continuam
    // cobertos e exceções fora de pages precisam ser justificadas no próprio local.
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
