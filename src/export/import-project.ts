import { parseDocument } from 'yaml'
import { deserializeProject, parseProject, ProjectFormatError } from '../domain/serialization'
import type { Project } from '../domain/schema'
import { importPair, type ExportFiles } from './package-format'
import { maxImportBytes, readArchive, safeArchivePath } from './archive'

export function importPackageFiles(files: ExportFiles): Project {
  if (Object.keys(files).some(name => !safeArchivePath(name))) throw new ProjectFormatError('Недопустимый путь файла.')
  const candidates = Object.keys(files).filter(name => /(^|\/)project\.json$/.test(name))
  if (candidates.length !== 1) throw new ProjectFormatError('Пакет должен содержать ровно один project.json.')
  const metadataPath = candidates[0]!
  const workflowPath = metadataPath.replace(/project\.json$/, 'workflow.json')
  const metadata: unknown = JSON.parse(files[metadataPath]!)
  if (!files[workflowPath]) throw new ProjectFormatError('Для метаданных project.json требуется workflow.json из той же папки.')
  const workflow: unknown = JSON.parse(files[workflowPath])
  return importPair(metadata, workflow)
}

export function importText(text: string, name: string): Project {
  if (new TextEncoder().encode(text).length > maxImportBytes) throw new ProjectFormatError('Лимит файла — 10 MiB.')
  if (/\.ya?ml$/i.test(name)) {
    const doc = parseDocument(text, { uniqueKeys: true })
    if (doc.errors.length || doc.warnings.length) throw new ProjectFormatError('Некорректный YAML или неподдерживаемый YAML tag.')
    const value: unknown = doc.toJS({ maxAliasCount: 0 })
    return parseProject(value)
  }
  return deserializeProject(text)
}

export async function importProjectFiles(files: readonly File[]): Promise<Project> {
  if (!files.length) throw new ProjectFormatError('Выберите файл проекта.')
  if (files.reduce((sum, file) => sum + file.size, 0) > maxImportBytes) throw new ProjectFormatError('Лимит импорта — 10 MiB.')
  if (files.length === 1) {
    const file = files[0]!
    if (/\.zip$/i.test(file.name)) return importPackageFiles(await readArchive(new Uint8Array(await file.arrayBuffer())))
    return importText(await file.text(), file.name)
  }
  if (new Set(files.map(file => file.name)).size !== files.length) throw new ProjectFormatError('Имена выбранных файлов повторяются.')
  return importPackageFiles(Object.fromEntries(await Promise.all(files.map(async file => [file.name, await file.text()]))))
}
