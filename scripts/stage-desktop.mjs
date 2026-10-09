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

import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
await access(electron)
const target = new URL('../.desktop-app/', import.meta.url)
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (resolve(fileURLToPath(target)) !== resolve(repository, '.desktop-app')) throw new Error('Unsafe staging directory')
await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
for (const folder of ['dist', 'desktop-dist', 'desktop/assets']) {
  await cp(new URL(`../${folder}`, import.meta.url), new URL(folder, target), { recursive: true })
}
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
await writeFile(new URL('package.json', target), JSON.stringify({
  name: 'workflow-architect', version, private: true,
  description: 'Visual engineering environment for AI workflows',
  license: 'GPL-3.0-or-later', author: 'quartz2004', main: 'desktop-dist/main.cjs',
}, null, 2))
