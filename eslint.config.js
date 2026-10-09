import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/**', 'desktop-dist/**', '.desktop-app/**', 'release/**', 'desktop-results/**', 'src/validation/generated/**', 'node_modules/**', 'test-results/**', 'performance-results/**', 'playwright-report/**', 'output/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-imports': ['error', { patterns: [{ group: ['@xyflow/*'], message: 'XYFlow belongs exclusively in src/canvas.' }] }],
    },
  },
  { files: ['src/canvas/**/*.{ts,tsx}'], rules: { 'no-restricted-imports': 'off' } },
)
