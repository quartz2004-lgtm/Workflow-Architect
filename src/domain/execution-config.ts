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

import { z } from 'zod'
import { editorialBudgetSchema } from './editorial-config'
import { agentLimitsSchema } from './agent-config'
import { connectorActionSchema } from './connector-actions'
import { agentKnowledgeSchema } from './knowledge-config'

/** Declarative data, never JavaScript. Empty JSON Pointer selects the entire value. */
export const jsonPointerSchema = z.string().max(1000).refine(value => value === '' || (value.startsWith('/') && !/~(?![01])/u.test(value)), 'Ожидается JSON Pointer: /field или пустая строка.')
export const valueSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('input'), pointer: jsonPointerSchema }),
  z.strictObject({ kind: z.literal('data'), portId: z.uuid(), pointer: jsonPointerSchema }),
  z.strictObject({ kind: z.literal('literal'), value: z.json() }),
])
export const predicateSchema = z.strictObject({
  source: valueSourceSchema,
  operator: z.enum(['exists', 'equals', 'not-equals', 'greater', 'greater-or-equal', 'less', 'less-or-equal', 'contains', 'is-true']),
  value: z.json().optional(),
}).superRefine((value, ctx) => {
  if (!['exists', 'is-true'].includes(value.operator) && value.value === undefined) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Укажите значение для сравнения.' })
  if (['greater', 'greater-or-equal', 'less', 'less-or-equal'].includes(value.operator) && typeof value.value !== 'number') ctx.addIssue({ code: 'custom', path: ['value'], message: 'Для сравнения порядка требуется число.' })
})
const fieldSchema = z.strictObject({
  key: z.string().min(1).max(200).refine(key => !['__proto__', 'prototype', 'constructor'].includes(key), 'Недопустимое имя поля.'),
  source: valueSourceSchema,
  transform: z.enum(['identity', 'text', 'number', 'uppercase', 'lowercase', 'trim', 'add']),
  operand: z.number().finite().optional(),
}).refine(field => field.transform !== 'add' || field.operand !== undefined, 'Укажите число для прибавления.')
const fieldsSchema = z.array(fieldSchema).max(100).refine(fields => new Set(fields.map(field => field.key)).size === fields.length, 'Имена полей должны быть уникальными.')

export const executionConfigSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('connector'), connectionId: z.uuid(), action: connectorActionSchema, fields: fieldsSchema }),
  z.strictObject({ kind: z.literal('telegram-message') }),
  z.strictObject({ kind: z.literal('schedule') }),
  z.strictObject({ kind: z.literal('agent'), limits: agentLimitsSchema, minimumWords: z.number().int().min(0).max(5000), requireTools: z.boolean(), knowledge: agentKnowledgeSchema.optional(), editorial: editorialBudgetSchema.optional() }),
  z.strictObject({ kind: z.literal('text-statistics'), minimumWords: z.number().int().min(0).max(5000) }),
  z.strictObject({ kind: z.literal('parallel'), joinNodeId: z.uuid(), concurrency: z.number().int().min(1).max(4) }),
  z.strictObject({ kind: z.literal('manual') }),
  z.strictObject({ kind: z.literal('map'), keepInput: z.boolean(), fields: fieldsSchema }),
  z.strictObject({ kind: z.literal('if'), predicate: predicateSchema, truePortId: z.uuid(), falsePortId: z.uuid() }),
  z.strictObject({ kind: z.literal('switch'), source: valueSourceSchema, cases: z.array(z.strictObject({ portId: z.uuid(), value: z.json() })).min(1).max(50), defaultPortId: z.uuid() }),
  z.strictObject({ kind: z.literal('loop'), predicate: predicateSchema, maxIterations: z.number().int().min(1).max(100), bodyPortId: z.uuid(), exitPortId: z.uuid() }),
  z.strictObject({ kind: z.literal('merge') }),
  z.strictObject({ kind: z.literal('human'), question: z.string().min(1).max(10_000), mode: z.enum(['approval', 'input']), timeoutMs: z.number().int().min(1000).max(86_400_000) }),
  z.strictObject({ kind: z.literal('artifact'), filename: z.string().min(1).max(150).regex(/^[^<>:"/\\|?*]+$/u).refine(value => [...value].every(char => char.charCodeAt(0) >= 32), 'Имя файла содержит управляющие символы.'), format: z.enum(['json', 'text']), source: valueSourceSchema }),
  z.strictObject({ kind: z.literal('subworkflow') }),
])

export type ExecutionConfig = z.infer<typeof executionConfigSchema>
export type ValueSource = z.infer<typeof valueSourceSchema>
export type Predicate = z.infer<typeof predicateSchema>
export type JsonValue = z.infer<ReturnType<typeof z.json>>
