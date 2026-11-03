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

import type { JsonValue } from '../domain/execution-config'
import { compileContract } from './contracts'

/** Bounded presentation helper. Only return an example accepted by the runtime validator. */
export function contractExample(schema: unknown): string | undefined {
  let visited = 0
  const sample = (value: unknown, depth = 0): JsonValue => {
    if (++visited > 100 || depth > 8) throw new Error('Example budget exceeded')
    if (value === true) return null
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('No example')
    const s = value as Record<string, unknown>
    if (Object.hasOwn(s, 'const')) return s.const as JsonValue
    if (Array.isArray(s.examples) && s.examples.length) return s.examples[0] as JsonValue
    if (Object.hasOwn(s, 'default')) return s.default as JsonValue
    if (Array.isArray(s.enum) && s.enum.length) return s.enum[0] as JsonValue
    const branch = s.oneOf ?? s.anyOf
    if (Array.isArray(branch)) return sample(branch[0], depth + 1)
    switch (s.type) {
      case 'null': return null
      case 'boolean': return false
      case 'string': {
        const length = typeof s.minLength === 'number' ? s.minLength : 0
        if (length > 200) throw new Error('Long example')
        return 'x'.repeat(length)
      }
      case 'integer': case 'number': return typeof s.minimum === 'number' ? s.minimum : typeof s.maximum === 'number' ? Math.min(0, s.maximum) : 0
      case 'array': {
        const count = typeof s.minItems === 'number' ? s.minItems : 0
        if (count > 8) throw new Error('Long example')
        return Array.from({ length: count }, () => sample(s.items ?? true, depth + 1))
      }
      case 'object': {
        const properties = s.properties && typeof s.properties === 'object' ? s.properties as Record<string, unknown> : {}
        const keys = Array.isArray(s.required) ? s.required : []
        if (keys.length > 32 || keys.some(key => typeof key !== 'string')) throw new Error('Large example')
        return Object.fromEntries((keys as string[]).map(key => [key, sample(properties[key] ?? s.additionalProperties ?? true, depth + 1)]))
      }
      default: throw new Error('No example')
    }
  }
  try {
    const validate = compileContract(schema), value = sample(schema)
    if (validate(value).length) return undefined
    return JSON.stringify(value, null, 2)
  } catch { return undefined }
}
