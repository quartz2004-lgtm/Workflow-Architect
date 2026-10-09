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

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyrightHeader, copyrightNotice, splitPreamble } from './copyright-header.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const sharedNotice = await readFile(new URL('../src/shared/copyright.ts', import.meta.url), 'utf8')
if (!sharedNotice.includes(`export const copyrightNotice = ${JSON.stringify(copyrightNotice)}`)) throw new Error('src/shared/copyright.ts must match docs/COPYRIGHT_NOTICE.txt')
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.cts', '.mts', '.jsx', '.css', '.html', '.ps1', '.sh', '.py', '.bat', '.cmd', '.yaml', '.yml'])
const paths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))]
const missing = []
let checked = 0
for (const path of paths) {
  const extension = extname(path)
  if (!extensions.has(extension)) continue
  const file = new URL(`../${path}`, import.meta.url)
  let source
  try { source = await readFile(file, 'utf8') } catch (error) { if (error.code === 'ENOENT') continue; throw error }
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const [preamble, body] = splitPreamble(normalized)
  const header = copyrightHeader(extension)
  checked++
  if (body.startsWith(header.trimEnd())) continue
  if (process.argv.includes('--fix')) {
    if (/^\s*(?:\/\*|<!--|#|rem)[\s\S]{0,200}Copyright/i.test(body)) throw new Error(`Review existing copyright manually: ${path}`)
    await writeFile(file, preamble + header + body)
  } else missing.push(path)
}
if (missing.length) { console.error(`Missing copyright notice:\n${missing.join('\n')}\nRun npm run copyright:fix for project-owned files.`); process.exitCode = 1 }
else console.log(`Copyright notice checked: ${checked} project files${process.argv.includes('--fix') ? ' (missing headers added)' : ''}`)
