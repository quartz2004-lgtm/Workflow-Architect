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

export interface ContractField {
  key: string; label: string; description?: string; required: boolean
  type: 'string' | 'number' | 'integer' | 'boolean'; choices?: (string | number | boolean)[]
}
export interface ContractForm { object: boolean; fields: ContractField[] }
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const complex = (schema: Record<string, unknown>) => ['$ref', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'const', 'patternProperties', 'dependentSchemas'].some(key => Object.hasOwn(schema, key))

/** Presentation only. Runtime contract validation remains authoritative. */
export function contractForm(schema: unknown): ContractForm | undefined {
  const root = schema === undefined ? { type: 'string' } : record(schema)
  if (!root || complex(root)) return undefined
  const object = root.type === 'object'
  const properties = object ? record(root.properties) : { answer: root }
  if (!properties || Object.keys(properties).length > 32 || !Object.keys(properties).length) return undefined
  const required = object && Array.isArray(root.required) ? root.required : []
  if (required.some(key => typeof key !== 'string' || !Object.hasOwn(properties, key))) return undefined
  const fields: ContractField[] = []
  for (const [key, value] of Object.entries(properties)) {
    const field = record(value)
    if (!field || complex(field) || !['string', 'number', 'integer', 'boolean'].includes(String(field.type))) return undefined
    const type = field.type as ContractField['type']
    const choices = field.enum
    if (choices !== undefined && (!Array.isArray(choices) || !choices.length || choices.length > 100 || choices.some(choice => typeof choice !== (type === 'integer' ? 'number' : type)))) return undefined
    fields.push({ key, label: typeof field.title === 'string' ? field.title : object ? key : 'Ваш ответ',
      ...(typeof field.description === 'string' ? { description: field.description } : {}),
      required: !object || required.includes(key), type, ...(choices ? { choices: choices as ContractField['choices'] } : {}),
    })
  }
  return { object, fields }
}

export function readContractForm(form: ContractForm, values: Record<string, string>): JsonValue {
  const entries: [string, JsonValue][] = []
  for (const field of form.fields) {
    const raw = values[field.key] ?? ''
    if (!raw && !field.required) continue
    let value: JsonValue
    if (field.choices) {
      if (!/^\d+$/.test(raw) || field.choices[Number(raw)] === undefined) throw new Error(`Выберите значение: ${field.label}`)
      value = field.choices[Number(raw)]!
    } else if (field.type === 'boolean') {
      if (!['true', 'false'].includes(raw)) throw new Error(`Выберите да или нет: ${field.label}`)
      value = raw === 'true'
    } else if (field.type === 'string') value = raw
    else {
      value = Number(raw)
      if (!raw.trim() || !Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value))) throw new Error(`Введите ${field.type === 'integer' ? 'целое число' : 'число'}: ${field.label}`)
    }
    entries.push([field.key, value])
  }
  return form.object ? Object.fromEntries(entries) : entries[0]![1]
}
