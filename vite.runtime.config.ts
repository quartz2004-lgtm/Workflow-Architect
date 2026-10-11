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

import { defineConfig } from 'vite'
import { copyrightNotice } from './src/shared/copyright.ts'

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'src/runtime/utility-entry.ts', outDir: 'runtime-dist', emptyOutDir: true,
    rollupOptions: { external: ['electron', /^node:/], output: { format: 'cjs', entryFileNames: 'runtime.cjs', banner: `/*!\n${copyrightNotice}\n*/` } },
  },
})
