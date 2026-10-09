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

import { projectSchema, type Project } from './schema'
import { assertPortableSnapshot } from './limits'

export class ProjectFormatError extends Error {}

// Deliberately narrow: detect obvious credentials without claiming arbitrary prose is secret-free.
export function assertNoObviousSecrets(value: unknown): void {
  const raw = JSON.stringify(value)
  if (/\bsk-[A-Za-z0-9_-]{20,}|\bgh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b/.test(raw)) {
    throw new ProjectFormatError('Обнаружен возможный секрет. Используйте имя переменной окружения или ссылку на credentials.')
  }
}

export function parseProject(value: unknown): Project {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== '0.1') {
    throw new ProjectFormatError('Неподдерживаемая версия проекта. Ожидается schemaVersion 0.1; автоматических миграций пока нет.')
  }
  assertNoObviousSecrets(value)
  const result = projectSchema.safeParse(value)
  if (!result.success) throw new ProjectFormatError(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'))
  return result.data
}

export function deserializeProject(raw: string): Project {
  assertPortableSnapshot(raw)
  return deserializeStoredProject(raw)
}

/** Local snapshots have no import byte quota; every read still validates the full schema. */
export function deserializeStoredProject(raw: string): Project {
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new ProjectFormatError('Некорректный JSON. Исходный файл не изменён.') }
  return parseProject(value)
}

/** Raw export preserves structurally valid drafts even with semantic diagnostics. */
export function serializeProject(project: Project): string {
  return JSON.stringify(parseProject(project), null, 2)
}
