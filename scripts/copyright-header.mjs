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

import { readFileSync } from 'node:fs'

export const copyrightNotice = readFileSync(new URL('../docs/COPYRIGHT_NOTICE.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n').trim()
export function copyrightHeader(extension) {
  if (['.yml', '.yaml', '.ps1', '.sh', '.py'].includes(extension)) return copyrightNotice.split('\n').map(line => `#${line ? ` ${line}` : ''}`).join('\n') + '\n\n'
  if (['.bat', '.cmd'].includes(extension)) return copyrightNotice.split('\n').map(line => `rem${line ? ` ${line}` : ''}`).join('\n') + '\n\n'
  if (extension === '.html') return `<!--\n${copyrightNotice}\n-->\n`
  return `/*\n${copyrightNotice}\n*/\n\n`
}
export function splitPreamble(source) {
  const match = source.match(/^(?:#![^\n]*\n|<!doctype[^>]*>\s*\n)/i)
  return match ? [match[0], source.slice(match[0].length)] : ['', source]
}
