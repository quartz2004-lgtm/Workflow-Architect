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

import draft07 from './generated/draft07'
import draft2020 from './generated/draft2020'

// Trusted metaschemas are compiled at build time, never in the browser/renderer.
const cache = new WeakMap<object, string | null>()
export function jsonSchemaProblem(schema: unknown): string | null {
  if (typeof schema === 'boolean') return null
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return 'JSON Schema должна быть объектом или boolean.'
  if (cache.has(schema)) return cache.get(schema) ?? null
  const dialect = '$schema' in schema ? schema.$schema : undefined
  if (dialect !== undefined && dialect !== 'http://json-schema.org/draft-07/schema' && dialect !== 'http://json-schema.org/draft-07/schema#' && dialect !== 'https://json-schema.org/draft/2020-12/schema') {
    return 'Поддерживаются JSON Schema draft-07 и 2020-12. Внешние метасхемы не загружаются.'
  }
  const validator = dialect === 'https://json-schema.org/draft/2020-12/schema' ? draft2020 : draft07
  let error: string | null = null
  try { if (!validator(schema)) error = validator.errors?.map(issue => `data${issue.instancePath} ${issue.message}`).join('; ') ?? 'Неверная JSON Schema.' }
  catch { error = 'Поддерживаются JSON Schema draft-07 и 2020-12. Внешние метасхемы не загружаются.' }
  cache.set(schema, error)
  return error
}
