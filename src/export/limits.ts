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

import type { ExportFiles } from './package-format'

export const maxImportBytes = 64 * 1024 * 1024
export const maxExpandedBytes = 128 * 1024 * 1024
export const maxArchiveFiles = 2000
export function safeArchivePath(path: string): boolean {
  return !!path && !path.startsWith('/') && !/[\\:]/.test(path) && !Array.from(path).some(char => char.charCodeAt(0) < 32) && path.split('/').every(part => part !== '.' && part !== '..' && part !== '')
}
export function assertPackageLimits(files: ExportFiles): void {
  const entries = Object.entries(files)
  if (entries.length > maxArchiveFiles || entries.some(([name]) => !safeArchivePath(name))) throw new Error('Недопустимый путь или более 2000 файлов в пакете.')
  let total = 0
  for (const [, text] of entries) {
    total += new TextEncoder().encode(text).byteLength
    if (total > maxExpandedBytes) throw new Error('Распакованный пакет превышает 128 MiB. Сохраните JSON snapshot или аварийную копию.')
  }
}
