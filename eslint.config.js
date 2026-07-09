import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // El código del servidor corre en Node, no en navegador: sin esto,
  // `process` y similares aparecen como no definidos.
  {
    files: ['server/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Los manejadores de error de Express exigen 4 argumentos aunque
      // `next` no se use; el prefijo _ marca esa intención.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
])
