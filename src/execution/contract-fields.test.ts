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
import { contractForm, readContractForm } from './contract-fields'
import { compileContract } from './contracts'

describe('human contract forms', () => {
  it('preserves false, zero and optional omission; runtime still checks bounds', () => {
    const schema = { type: 'object', properties: { accepted: { type: 'boolean' }, count: { type: 'integer', minimum: 1 }, note: { type: 'string' } }, required: ['accepted', 'count'], additionalProperties: false }
    const form = contractForm(schema)!
    expect(readContractForm(form, { accepted: 'false', count: '0' })).toEqual({ accepted: false, count: 0 })
    expect(compileContract(schema)(readContractForm(form, { accepted: 'true', count: '2' }))).toEqual([])
    expect(compileContract(schema)(readContractForm(form, { accepted: 'false', count: '0' })).length).toBeGreaterThan(0)
    expect(() => readContractForm(form, { count: '2' })).toThrow('да или нет')
  })
  it('keeps enum values typed instead of coercing their labels', () => {
    const form = contractForm({ type: 'number', enum: [10, 20] })!
    expect(readContractForm(form, { answer: '1' })).toBe(20)
    expect(() => readContractForm(form, { answer: '20' })).toThrow('Выберите')
    expect(() => readContractForm(contractForm({ type: 'number' })!, { answer: 'Infinity' })).toThrow('число')
  })
  it('does not pretend to render nested or conditional contracts', () => {
    expect(contractForm({ type: 'object', properties: { x: { type: 'array', items: { type: 'string' } } } })).toBeUndefined()
    expect(contractForm({ oneOf: [{ type: 'string' }, { type: 'boolean' }] })).toBeUndefined()
    expect(readContractForm(contractForm(undefined)!, { answer: 'Обычный ответ' })).toBe('Обычный ответ')
  })
})
