import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'

export default defineConfig({
  plugins: [react(), {
    name: 'third-party-notices',
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.md', source: await readFile(new URL('./THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8') })
    },
  }],
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
