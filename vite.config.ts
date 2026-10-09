/*
Copyright (C) 2026  quartz2004

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://gnu.org>.
*/

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { copyrightNotice } from './src/shared/copyright.ts'

export default defineConfig({
  plugins: [react(), {
    name: 'project-legal-notices',
    enforce: 'post',
    augmentChunkHash() { return copyrightNotice },
    async writeBundle(options, bundle) {
      const header = `/*!\n${copyrightNotice}\n*/\n`
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk' && !file.fileName.endsWith('.css')) continue
        const path = resolve(options.dir ?? 'dist', file.fileName)
        const source = await readFile(path, 'utf8')
        // Vite can prepend its preload helper after generateBundle.
        if (!source.startsWith(header)) await writeFile(path, header + source.replace(header, ''), 'utf8')
      }
    },
    async generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') file.code = `/*!\n${copyrightNotice}\n*/\n${file.code}`
        else if (file.fileName.endsWith('.css')) file.source = `/*!\n${copyrightNotice}\n*/\n${String(file.source)}`
      }
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.md', source: await readFile(new URL('./THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8') })
      this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source: await readFile(new URL('./LICENSE.txt', import.meta.url), 'utf8') })
    },
  }],
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
