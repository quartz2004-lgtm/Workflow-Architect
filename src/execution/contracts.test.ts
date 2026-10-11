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
import { compileContract } from './contracts'

describe('execution contract interpreter', () => {
  it('enforces nested data, required, own properties and additional properties', () => {
    const check = compileContract({ type: 'object', required: ['amount', 'items'], additionalProperties: false, properties: {
      amount: { type: 'number', minimum: 0, exclusiveMaximum: 10 },
      items: { type: 'array', minItems: 1, items: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 2 } } } },
    } })
    expect(check({ amount: 3, items: [{ name: 'ok' }] })).toEqual([])
    expect(check({ amount: '3', items: [{ name: 'x' }], extra: 1 }).map(issue => issue.path)).toEqual(['/amount', '/items/0/name', '/extra'])
    expect(check({ amount: 10, items: [] })).toHaveLength(2)
    expect(check({ amount: 0 })).toHaveLength(1)
    expect(compileContract({ required: ['constructor'] })({})).toHaveLength(1)
  })
  it('honors boolean schemas, structural equality and Unicode code point lengths', () => {
    expect(compileContract(false)(null)).toHaveLength(1)
    expect(compileContract(true)(null)).toEqual([])
    expect(compileContract({ const: { a: 1, b: 2 } })({ b: 2, a: 1 })).toEqual([])
    expect(compileContract({ enum: [null, false] })(0)).toHaveLength(1)
    expect(compileContract({ type: 'string', maxLength: 1 })('😀')).toEqual([])
  })
  it('checks composition without treating unsuccessful trial branches as final errors', () => {
    const check = compileContract({ allOf: [{ anyOf: [{ type: 'number' }, { type: 'string' }] }, { not: { const: 'forbidden' } }] })
    expect(check(4)).toEqual([])
    expect(check('ok')).toEqual([])
    expect(check('forbidden')).toHaveLength(1)
    expect(check(null)).toHaveLength(1)
    expect(compileContract({ oneOf: [{ type: 'number' }, { minimum: 0 }] })(4)).toHaveLength(1)
  })
  it('rejects unsupported assertions and remote references before any execution', () => {
    for (const schema of [{ pattern: '(a+)+$' }, { format: 'email' }, { $ref: 'https://example.com/schema' }, { properties: { value: { multipleOf: 2 } } }, { items: [{ type: 'number' }] }]) {
      expect(() => compileContract(schema)).toThrow()
    }
    expect(() => compileContract({ type: 'imaginary' })).toThrow()
    expect(() => compileContract({ minimum: '4' })).toThrow()
  })
  it('captures a snapshot and bounds diagnostic size', () => {
    const schema = { type: 'number', minimum: 5 }
    const check = compileContract(schema)
    schema.minimum = 0
    expect(check(2)).toHaveLength(1)
    const issues = compileContract({ items: false })(Array.from({ length: 100 }, () => 1))
    expect(issues).toHaveLength(30)
  })
})
