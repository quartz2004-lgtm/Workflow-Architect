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

import { describe, expect, it } from 'vitest'
import { contractExample } from './contract-example'
describe('contract input examples', () => {
  it('creates valid nested structures without executing or modifying the schema', () => {
    const schema = { type: 'object', required: ['items'], properties: { items: { type: 'array', minItems: 1, items: { type: 'object', required: ['value'], properties: { value: { type: 'integer', minimum: 2 } } } } } }
    const original = structuredClone(schema)
    expect(JSON.parse(contractExample(schema)!)).toEqual({ items: [{ value: 2 }] })
    expect(schema).toEqual(original)
  })
  it('rejects invalid examples and unsupported or excessive schemas', () => {
    expect(contractExample({ type: 'integer', minimum: 2, examples: [0] })).toBeUndefined()
    expect(contractExample({ type: 'string', pattern: '^a$' })).toBeUndefined()
    expect(contractExample({ type: 'array', minItems: 100, items: true })).toBeUndefined()
    expect(contractExample(false)).toBeUndefined()
  })
})
