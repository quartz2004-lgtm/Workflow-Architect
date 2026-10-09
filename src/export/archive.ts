import { AsyncUnzipInflate, strToU8, Unzip, zip, type UnzipFile } from 'fflate'
import type { ExportFiles } from './package-format'
import { assertPackageLimits, maxArchiveFiles, maxExpandedBytes, maxImportBytes, safeArchivePath } from './limits'
export { maxImportBytes, safeArchivePath } from './limits'

export function createArchive(files: ExportFiles): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    assertPackageLimits(files)
    zip(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 6 }, (error, data) => {
      if (error) reject(error)
      else if (data.byteLength > maxImportBytes) reject(new Error('Сжатый архив превышает 64 MiB. Сохраните JSON snapshot или аварийную копию.'))
      else resolve(new Uint8Array(data))
    })
  })
}

/** Streaming output limits also apply when ZIP headers lie about expanded size. */
export function readArchive(data: Uint8Array): Promise<ExportFiles> {
  if (data.byteLength > maxImportBytes) return Promise.reject(new Error('Лимит архива — 64 MiB.'))
  return new Promise((resolve, reject) => {
    const files: ExportFiles = Object.create(null) as ExportFiles
    const seen = new Set<string>()
    const active = new Set<UnzipFile>()
    let total = 0, pending = 0, pushed = false, failed = false
    const fail = (error: unknown) => { failed = true; for (const file of active) file.terminate(); reject(error) }
    const finish = () => { if (pushed && pending === 0 && !failed) resolve(files) }
    const unzip = new Unzip(file => {
      if (failed) return
      const name = file.name.endsWith('/') ? file.name.slice(0, -1) : file.name
      if (!safeArchivePath(name) || seen.has(name) || seen.size >= maxArchiveFiles) { fail(new Error('Недопустимый путь, повторяющийся файл или слишком много файлов в ZIP.')); return }
      seen.add(name)
      if (file.name.endsWith('/')) return
      if ((file.originalSize ?? 0) > maxExpandedBytes) { fail(new Error('Распакованный архив превышает 128 MiB.')); return }
      const chunks: Uint8Array[] = []
      let size = 0
      active.add(file); pending++
      file.ondata = (error, chunk, final) => {
        if (failed) return
        if (error) { fail(error); return }
        size += chunk.byteLength; total += chunk.byteLength
        if (total > maxExpandedBytes) { fail(new Error('Распакованный архив превышает 128 MiB.')); return }
        chunks.push(chunk)
        if (final) {
          try {
            const bytes = new Uint8Array(size)
            let offset = 0
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
            files[name] = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
            active.delete(file); pending--; finish()
          } catch (error) { fail(error) }
        }
      }
      file.start()
    })
    unzip.register(AsyncUnzipInflate)
    try { unzip.push(data, true); pushed = true; finish() } catch (error) { fail(error) }
  })
}
