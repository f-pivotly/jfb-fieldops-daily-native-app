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
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/data/index.js'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'axios',
          message: 'Import axios only in src/data/index.js — route all network IO through that module.',
        }],
      }],
      'no-restricted-globals': ['error',
        { name: 'fetch', message: 'Call fetch only in src/data/index.js — route all network IO through that module.' },
        { name: 'XMLHttpRequest', message: 'Use XMLHttpRequest only in src/data/index.js — route all network IO through that module.' },
      ],
    },
  },
])
