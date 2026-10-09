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

import { parseDocument } from 'yaml'
import { deserializeProject, parseProject, ProjectFormatError } from '../domain/serialization'
import type { Project } from '../domain/schema'
import { importPair, type ExportFiles } from './package-format'
import { maxImportBytes, readArchive, safeArchivePath } from './archive'
import { assertPackageLimits, maxExpandedBytes } from './limits'
import { assertPortableSnapshot } from '../domain/limits'

export function importPackageFiles(files: ExportFiles): Project {
  assertPackageLimits(files)
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
  assertPortableSnapshot(text)
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
  const byteLimit = files.length === 1 ? maxImportBytes : maxExpandedBytes
  if (files.reduce((sum, file) => sum + file.size, 0) > byteLimit) throw new ProjectFormatError(`Лимит импорта — ${byteLimit / 1024 / 1024} MiB.`)
  if (files.length === 1) {
    const file = files[0]!
    if (/\.zip$/i.test(file.name)) return importPackageFiles(await readArchive(new Uint8Array(await file.arrayBuffer())))
    return importText(await file.text(), file.name)
  }
  if (new Set(files.map(file => file.name)).size !== files.length) throw new ProjectFormatError('Имена выбранных файлов повторяются.')
  return importPackageFiles(Object.fromEntries(await Promise.all(files.map(async file => [file.name, await file.text()]))))
}
