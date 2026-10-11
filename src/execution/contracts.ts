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
import { jsonSchemaProblem } from '../validation/json-schema'
import { assertValueBudget, jsonEqual, ExecutionValueError } from './values'

type Schema = boolean | { [key: string]: JsonValue }
export interface ContractIssue { path: string; message: string }
export type ContractCheck = (value: JsonValue) => ContractIssue[]
const annotations = ['$schema', '$id', '$comment', 'title', 'description', 'default', 'examples', 'readOnly', 'writeOnly', 'deprecated']
const keywords = new Set([...annotations, 'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minProperties', 'maxProperties', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'allOf', 'anyOf', 'oneOf', 'not'])
const escaped = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1')

/** Unknown assertions fail closed. No generated code, remote refs, regex or implicit coercion. */
export function compileContract(input: unknown): ContractCheck {
  assertValueBudget(input, 128 * 1024)
  const problem = jsonSchemaProblem(input)
  if (problem) throw new ExecutionValueError(problem)
  const schema = structuredClone(input) as Schema
  let schemas = 0
  const inspect = (value: Schema, path: string, depth: number): void => {
    if (++schemas > 500 || depth > 24) throw new ExecutionValueError('Контракт слишком сложен: максимум 500 схем и 24 уровня.')
    if (typeof value === 'boolean') return
    for (const key of Object.keys(value)) if (!keywords.has(key)) throw new ExecutionValueError(`Контракт ${path || '/'}: ограничение ${key} пока не исполняется.`)
    if (Array.isArray(value.enum) && value.enum.length > 100) throw new ExecutionValueError('Контракт: не более 100 вариантов enum.')
    for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
      const list = value[keyword]
      if (Array.isArray(list)) list.forEach((child, index) => inspect(child as Schema, `${path}/${keyword}/${index}`, depth + 1))
    }
    for (const keyword of ['items', 'additionalProperties', 'not']) {
      const child = value[keyword]
      if (child !== undefined) {
        if (Array.isArray(child)) throw new ExecutionValueError('Контракт: tuple items пока не исполняется.')
        inspect(child as Schema, `${path}/${keyword}`, depth + 1)
      }
    }
    if (value.properties && typeof value.properties === 'object' && !Array.isArray(value.properties)) {
      for (const [key, child] of Object.entries(value.properties)) inspect(child as Schema, `${path}/properties/${escaped(key)}`, depth + 1)
    }
  }
  inspect(schema, '', 0)
  return value => {
    assertValueBudget(value)
    const issues: ContractIssue[] = []
    let operations = 0
    const check = (rule: Schema, data: JsonValue, path: string, target: ContractIssue[]): void => {
      if (++operations > 100_000) throw new ExecutionValueError('Превышен лимит проверки контракта.')
      if (target.length >= 30 || rule === true) return
      const fail = (message: string) => { if (target.length < 30) target.push({ path: path || '/', message }) }
      if (rule === false) { fail('Значение запрещено контрактом.'); return }
      if (Object.hasOwn(rule, 'const') && !jsonEqual(data, rule.const!)) fail('Значение не совпадает с const.')
      if (Array.isArray(rule.enum) && !rule.enum.some(item => jsonEqual(data, item))) fail('Значение отсутствует в enum.')
      const typeMatches = (type: JsonValue): boolean => {
        switch (type) {
          case 'null': return data === null
          case 'array': return Array.isArray(data)
          case 'object': return data !== null && typeof data === 'object' && !Array.isArray(data)
          case 'integer': return typeof data === 'number' && Number.isInteger(data)
          case 'number': return typeof data === 'number'
          default: return typeof data === type
        }
      }
      if (rule.type !== undefined && !(Array.isArray(rule.type) ? rule.type.some(typeMatches) : typeMatches(rule.type))) {
        fail(`Ожидается тип ${Array.isArray(rule.type) ? rule.type.join(' / ') : String(rule.type)}.`)
        return
      }
      const minimum = (keyword: string, amount: number) => { if (typeof rule[keyword] === 'number' && amount < rule[keyword]) fail(`${keyword}: требуется не меньше ${rule[keyword]}.`) }
      const maximum = (keyword: string, amount: number) => { if (typeof rule[keyword] === 'number' && amount > rule[keyword]) fail(`${keyword}: требуется не больше ${rule[keyword]}.`) }
      if (typeof data === 'number') {
        minimum('minimum', data); maximum('maximum', data)
        if (typeof rule.exclusiveMinimum === 'number' && data <= rule.exclusiveMinimum) fail('Значение должно быть больше exclusiveMinimum.')
        if (typeof rule.exclusiveMaximum === 'number' && data >= rule.exclusiveMaximum) fail('Значение должно быть меньше exclusiveMaximum.')
      }
      if (typeof data === 'string') { const length = [...data].length; minimum('minLength', length); maximum('maxLength', length) }
      if (Array.isArray(data)) {
        minimum('minItems', data.length); maximum('maxItems', data.length)
        if (rule.items !== undefined) data.forEach((item, index) => check(rule.items as Schema, item, `${path}/${index}`, target))
      } else if (data !== null && typeof data === 'object') {
        const keys = Object.keys(data)
        minimum('minProperties', keys.length); maximum('maxProperties', keys.length)
        if (Array.isArray(rule.required)) for (const key of rule.required) if (typeof key === 'string' && !Object.hasOwn(data, key)) fail(`Отсутствует обязательное поле ${key}.`)
        const properties = rule.properties && typeof rule.properties === 'object' && !Array.isArray(rule.properties) ? rule.properties : {}
        for (const key of keys) {
          if (Object.hasOwn(properties, key)) check(properties[key] as Schema, data[key]!, `${path}/${escaped(key)}`, target)
          else if (rule.additionalProperties !== undefined) check(rule.additionalProperties as Schema, data[key]!, `${path}/${escaped(key)}`, target)
        }
      }
      if (Array.isArray(rule.allOf)) for (const child of rule.allOf) check(child as Schema, data, path, target)
      for (const keyword of ['anyOf', 'oneOf']) {
        const choices = rule[keyword]
        if (!Array.isArray(choices)) continue
        let matches = 0
        for (const child of choices) { const trial: ContractIssue[] = []; check(child as Schema, data, path, trial); if (trial.length === 0) matches++ }
        if (keyword === 'anyOf' ? matches === 0 : matches !== 1) fail(`${keyword}: число подходящих вариантов ${matches}.`)
      }
      if (rule.not !== undefined) { const trial: ContractIssue[] = []; check(rule.not as Schema, data, path, trial); if (!trial.length) fail('Значение удовлетворяет запрещённому not.') }
    }
    check(schema, value, '', issues)
    return issues
  }
}
