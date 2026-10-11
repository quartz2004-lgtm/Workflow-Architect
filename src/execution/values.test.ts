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
import { executionConfigSchema, predicateSchema } from '../domain/execution-config'
import { assertValueBudget, evaluatePredicate, jsonEqual, mapValue, readPointer } from './values'

describe('declarative execution values', () => {
  it('reads escaped JSON pointers and arrays without prototype traversal', () => {
    expect(readPointer({ 'a/b': { '~': [4, null] } }, '/a~1b/~0/1')).toBeNull()
    expect(readPointer({}, '/constructor')).toBeUndefined()
    expect(readPointer([5], '/length')).toBeUndefined()
    expect(readPointer([5], '/00')).toBeUndefined()
    expect(() => readPointer({}, '/x~2')).toThrow('Pointer')
  })
  it('compares JSON structurally and rejects implicit numeric conversion', () => {
    expect(jsonEqual({ a: 1, b: [null] }, { b: [null], a: 1 })).toBe(true)
    const predicate = predicateSchema.parse({ source: { kind: 'input', pointer: '/amount' }, operator: 'greater', value: 10 })
    expect(evaluatePredicate(predicate, { amount: 11 })).toBe(true)
    expect(evaluatePredicate(predicate, { amount: 9 })).toBe(false)
    expect(() => evaluatePredicate(predicate, { amount: '11' })).toThrow('чисел')
    expect(() => evaluatePredicate(predicate, {})).toThrow('Отсутствует')
    expect(predicateSchema.safeParse({ ...predicate, value: '10' }).success).toBe(false)
  })
  it('distinguishes missing fields from null and false', () => {
    const predicate = predicateSchema.parse({ source: { kind: 'input', pointer: '/value' }, operator: 'exists' })
    expect(evaluatePredicate(predicate, {})).toBe(false)
    expect(evaluatePredicate(predicate, { value: null })).toBe(true)
    expect(evaluatePredicate(predicate, { value: false })).toBe(true)
  })
  it('maps fields without mutation and treats code-shaped strings as data', () => {
    const config = executionConfigSchema.parse({ kind: 'map', keepInput: true, fields: [
      { key: 'title', source: { kind: 'input', pointer: '/name' }, transform: 'uppercase' },
      { key: 'amount', source: { kind: 'literal', value: '12' }, transform: 'number' },
      { key: 'literal', source: { kind: 'literal', value: 'fetch("https://example.com")' }, transform: 'identity' },
    ] })
    if (config.kind !== 'map') throw new Error('Wrong fixture')
    const input = { name: 'отчёт' }
    expect(mapValue(config, input)).toEqual({ name: 'отчёт', title: 'ОТЧЁТ', amount: 12, literal: 'fetch("https://example.com")' })
    expect(input).toEqual({ name: 'отчёт' })
    expect(() => mapValue(config, {})).toThrow('Отсутствует')
    expect(executionConfigSchema.safeParse({ ...config, fields: [{ ...config.fields[0], key: '__proto__' }] }).success).toBe(false)
    expect(executionConfigSchema.safeParse({ ...config, fields: [config.fields[0], config.fields[0]] }).success).toBe(false)
  })
  it('bounds values before cloning or recursive interpretation', () => {
    expect(() => assertValueBudget({ ok: [true, null, 3] })).not.toThrow()
    expect(() => assertValueBudget({ number: Infinity })).toThrow('нечисловое')
    expect(() => assertValueBudget({ value: undefined })).toThrow('не является JSON')
    expect(() => assertValueBudget('x'.repeat(100), 50)).toThrow('лимит')
    const cycle: Record<string, unknown> = {}; cycle.self = cycle
    expect(() => assertValueBudget(cycle)).toThrow('ссылку')
    let deep: unknown = null
    for (let i = 0; i < 70; i++) deep = { next: deep }
    expect(() => assertValueBudget(deep)).toThrow('глубина')
  })
  it('increments a loop counter explicitly and rejects overflow', () => {
    const config = executionConfigSchema.parse({ kind: 'map', keepInput: true, fields: [
      { key: 'counter', source: { kind: 'input', pointer: '/counter' }, transform: 'add', operand: 1 },
    ] })
    if (config.kind !== 'map') throw new Error('Wrong fixture')
    expect(mapValue(config, { counter: 3 })).toEqual({ counter: 4 })
    expect(() => mapValue(config, { counter: '3' })).toThrow('чисел')
    expect(() => mapValue({ ...config, fields: [{ ...config.fields[0]!, operand: Number.MAX_VALUE }] }, { counter: Number.MAX_VALUE })).toThrow('чисел')
  })
})
