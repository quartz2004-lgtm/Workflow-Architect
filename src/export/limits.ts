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
