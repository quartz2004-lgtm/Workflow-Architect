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

import type { ExecutionConfig, JsonValue, Predicate, ValueSource } from '../domain/execution-config'

export class ExecutionValueError extends Error {}

/** Bounded, own-property-only traversal; no prototype lookup, evaluation or mutation. */
export function readPointer(input: JsonValue, pointer: string): JsonValue | undefined {
  if (pointer === '') return input
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer)) throw new ExecutionValueError('Неверный JSON Pointer.')
  const parts = pointer.slice(1).split('/')
  if (parts.length > 64) throw new ExecutionValueError('Превышена глубина пути (64).')
  let value: JsonValue | undefined = input
  for (const part of parts) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~')
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined
    if (Array.isArray(value)) {
      if (!/^(0|[1-9]\d*)$/u.test(key)) return undefined
      value = value[Number(key)]
    } else value = value[key]
  }
  return value
}

export function sourceValue(source: ValueSource, input: JsonValue): JsonValue {
  if (source.kind === 'literal') return structuredClone(source.value)
  const value = readPointer(input, source.pointer)
  if (value === undefined) throw new ExecutionValueError(`Отсутствует входное поле ${source.pointer}.`)
  return structuredClone(value)
}

export function jsonEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => jsonEqual(item, b[index]!))
  if (Array.isArray(a) || Array.isArray(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && jsonEqual(a[key]!, b[key]!))
}

export function evaluatePredicate(predicate: Predicate, input: JsonValue): boolean {
  if (predicate.operator === 'exists') return predicate.source.kind === 'literal' || readPointer(input, predicate.source.pointer) !== undefined
  const value = sourceValue(predicate.source, input)
  switch (predicate.operator) {
    case 'is-true': return value === true
    case 'equals': return jsonEqual(value, predicate.value!)
    case 'not-equals': return !jsonEqual(value, predicate.value!)
    case 'contains': {
      if (typeof value === 'string' && typeof predicate.value === 'string') return value.includes(predicate.value)
      if (Array.isArray(value)) return value.some(item => jsonEqual(item, predicate.value!))
      throw new ExecutionValueError('«Содержит» требует строку со строкой либо массив.')
    }
    default: {
      if (typeof value !== 'number' || typeof predicate.value !== 'number') throw new ExecutionValueError('Сравнение порядка требует чисел без неявного преобразования.')
      if (predicate.operator === 'greater') return value > predicate.value
      if (predicate.operator === 'greater-or-equal') return value >= predicate.value
      if (predicate.operator === 'less') return value < predicate.value
      return value <= predicate.value
    }
  }
}

export function mapValue(config: Extract<ExecutionConfig, { kind: 'map' }>, input: JsonValue): JsonValue {
  if (config.keepInput && (input === null || typeof input !== 'object' || Array.isArray(input))) throw new ExecutionValueError('Сохранение исходных полей требует объект.')
  const result: Record<string, JsonValue> = config.keepInput ? structuredClone(input) as Record<string, JsonValue> : {}
  for (const field of config.fields) {
    if (['__proto__', 'prototype', 'constructor'].includes(field.key)) throw new ExecutionValueError('Недопустимое имя поля.')
    const value = sourceValue(field.source, input)
    if (field.transform === 'identity') result[field.key] = value
    else if (field.transform === 'text') result[field.key] = typeof value === 'string' ? value : JSON.stringify(value)
    else if (field.transform === 'add') {
      if (typeof value !== 'number' || field.operand === undefined || !Number.isFinite(value + field.operand)) throw new ExecutionValueError(`Поле ${field.key}: прибавление требует конечных чисел.`)
      result[field.key] = value + field.operand
    } else if (field.transform === 'number') {
      if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) throw new ExecutionValueError(`Поле ${field.key}: требуется число или числовая строка.`)
      const number = Number(value)
      if (!Number.isFinite(number)) throw new ExecutionValueError(`Поле ${field.key}: неверное число.`)
      result[field.key] = number
    } else {
      if (typeof value !== 'string') throw new ExecutionValueError(`Поле ${field.key}: требуется строка.`)
      result[field.key] = field.transform === 'trim' ? value.trim() : field.transform === 'uppercase' ? value.toUpperCase() : value.toLowerCase()
    }
  }
  return result
}

/** Validate once at execution boundaries before recursive operations or structuredClone. */
export function assertValueBudget(value: unknown, maxBytes = 2 * 1024 * 1024, omitOptionalProperties = false): asserts value is JsonValue {
  let approximateBytes = 0
  const seen = new Set<object>()
  const pending: { value: unknown; depth: number; exiting?: boolean }[] = [{ value, depth: 0 }]
  while (pending.length) {
    const item = pending.pop()!
    if (item.exiting && item.value && typeof item.value === 'object') { seen.delete(item.value); continue }
    if (item.depth > 64) throw new ExecutionValueError('Превышена глубина JSON (64).')
    const current = item.value
    approximateBytes += 8
    if (typeof current === 'string') approximateBytes += current.length * 6
    else if (typeof current === 'number') { if (!Number.isFinite(current)) throw new ExecutionValueError('JSON содержит нечисловое значение.') }
    else if (current !== null && typeof current === 'object') {
      if (seen.has(current)) throw new ExecutionValueError('JSON содержит циклическую ссылку.')
      seen.add(current)
      pending.push({ value: current, depth: item.depth, exiting: true })
      if (!Array.isArray(current) && Object.getPrototypeOf(current) !== Object.prototype && Object.getPrototypeOf(current) !== null) throw new ExecutionValueError('Ожидаются обычные JSON-объекты.')
      for (const [key, child] of Object.entries(current)) {
        // Domain drafts may hold absent optional properties; serialization omits them.
        if (omitOptionalProperties && !Array.isArray(current) && child === undefined) continue
        approximateBytes += key.length * 6
        pending.push({ value: child, depth: item.depth + 1 })
        if (pending.length > 100_000) throw new ExecutionValueError('Слишком много JSON-элементов.')
      }
    } else if (current !== null && typeof current !== 'boolean') throw new ExecutionValueError('Значение не является JSON.')
    if (approximateBytes > maxBytes) throw new ExecutionValueError('Превышен лимит размера данных выполнения.')
  }
}
