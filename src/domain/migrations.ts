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

import type { Project } from './schema'
import { assertNoObviousSecrets, parseProject, ProjectFormatError } from './serialization'

export interface ProjectMigration {
  from: string
  to: string
  validateSource(value: unknown): void
  transform(value: unknown): unknown
}

/** No artificial version bump: 0.1 is still current. Register real, tested transitions here. */
export const projectMigrations: readonly ProjectMigration[] = []

function versionOf(value: unknown): string {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || typeof value.schemaVersion !== 'string') throw new ProjectFormatError('Отсутствует версия формата проекта.')
  return value.schemaVersion
}

/** Backup is durable before the first transform; source objects and original bytes are never mutated. */
export async function migrateProjectSnapshot(raw: string, backup: (raw: string, from: string) => Promise<void>, migrations = projectMigrations): Promise<Project> {
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new ProjectFormatError('Некорректный JSON. Исходный файл не изменён.') }
  const originalVersion = versionOf(value)
  if (originalVersion === '0.1') return parseProject(value)
  const route: ProjectMigration[] = []
  const visited = new Set<string>()
  let version = originalVersion
  while (version !== '0.1') {
    if (visited.has(version)) throw new ProjectFormatError('Цикл в цепочке миграций.')
    visited.add(version)
    const candidates = migrations.filter(step => step.from === version)
    if (candidates.length !== 1) throw new ProjectFormatError(`Неподдерживаемая версия проекта ${version}. Нет однозначной миграции в 0.1.`)
    const step = candidates[0]!
    route.push(step); version = step.to
  }
  assertNoObviousSecrets(value)
  route[0]!.validateSource(value)
  await backup(raw, originalVersion)
  for (const step of route) {
    step.validateSource(value)
    value = step.transform(structuredClone(value))
    if (versionOf(value) !== step.to) throw new ProjectFormatError('Миграция вернула неверную версию формата.')
  }
  return parseProject(value)
}
