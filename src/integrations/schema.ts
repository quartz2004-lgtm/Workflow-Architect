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
import { profileIds } from '../profiles/schema'

export const integrationIdSchema = z.enum(['http-json', 'local-files', 'telegram', 'mcp-filesystem'])
export const safeFieldSchema = z.string().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/).refine(value => !['constructor', 'prototype', '__proto__'].includes(value))
export const relativeFileSchema = z.string().min(1).max(500).refine(value => {
  const parts = value.split('/')
  return !/[\\:<>"|?*]/u.test(value) && [...value].every(char => char.charCodeAt(0) >= 32) && parts.every(part => part !== '' && part !== '.' && part !== '..' && !/[. ]$/u.test(part) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(part))
}, 'Укажите относительный путь без .., обратных слешей и служебных имён Windows.')
export const connectionSettingsSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('http-json'), baseUrl: z.url().max(2000), credentialId: z.uuid().nullable(), authentication: z.enum(['none', 'bearer', 'header']), headerName: safeFieldSchema.default('X-API-Key'), allowWrites: z.boolean() }),
  z.strictObject({ kind: z.literal('local-files'), root: z.string().min(1).max(2000), allowWrites: z.boolean() }),
  z.strictObject({ kind: z.literal('telegram'), credentialId: z.uuid() }),
  z.strictObject({ kind: z.literal('mcp-filesystem'), root: z.string().min(1).max(2000), tools: z.array(z.strictObject({ name: z.string().min(1).max(100), schemaHash: z.string().regex(/^[a-f0-9]{64}$/) })).max(30) }),
])
export const integrationConnectionSchema = z.strictObject({
  version: z.literal('0.5'), id: z.uuid(), profileId: z.enum(profileIds), label: z.string().trim().min(1).max(100), enabled: z.boolean(), revision: z.number().int().nonnegative(), settings: connectionSettingsSchema,
})
export type IntegrationConnection = z.infer<typeof integrationConnectionSchema>
export type ConnectionSettings = z.infer<typeof connectionSettingsSchema>
export const actionNameSchema = z.enum(['http.request', 'files.read', 'files.write', 'files.list', 'telegram.send-message', 'telegram.send-document', 'mcp.call'])
export type ActionName = z.infer<typeof actionNameSchema>
export const actionArgumentsSchemas = {
  'http.request': z.strictObject({ method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']), path: z.string().max(2000), query: z.record(safeFieldSchema, z.string().max(4000)).default({}), body: z.json().optional() }),
  'files.read': z.strictObject({ path: relativeFileSchema }),
  'files.write': z.strictObject({ path: relativeFileSchema, content: z.string().max(1_000_000), expectedHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }),
  'files.list': z.strictObject({ path: relativeFileSchema.optional() }),
  'telegram.send-message': z.strictObject({ chatId: z.string().regex(/^[1-9]\d{0,15}$/), text: z.string().min(1).max(4096) }),
  'telegram.send-document': z.strictObject({ chatId: z.string().regex(/^[1-9]\d{0,15}$/), filename: relativeFileSchema.refine(value => !value.includes('/')), content: z.string().max(1_000_000), caption: z.string().max(1024).optional() }),
  'mcp.call': z.strictObject({ tool: z.string().min(1).max(100), arguments: z.record(z.string(), z.json()) }),
} as const
export const actionConnectionKinds: Record<ActionName, ConnectionSettings['kind']> = {
  'http.request': 'http-json', 'files.read': 'local-files', 'files.write': 'local-files', 'files.list': 'local-files', 'telegram.send-message': 'telegram', 'telegram.send-document': 'telegram', 'mcp.call': 'mcp-filesystem',
}
