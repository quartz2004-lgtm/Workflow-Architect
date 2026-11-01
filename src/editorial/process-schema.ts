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

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const processSettingsSchema = z.strictObject({
  contextTokens: z.number().int().min(2048).max(32768),
  maxOutputTokens: z.number().int().min(128).max(8192),
  temperature: z.number().min(0).max(2),
  stageTimeoutMs: z.number().int().min(1000).max(900000),
})
export const voiceDraftSchema = z.strictObject({
  text: z.string().trim().min(1).max(3000),
  sourceLabel: z.string().trim().min(1).max(500), sourceDigest: digest,
  origin: z.enum(['owner-approved', 'development']),
})
export const voiceExampleSchema = voiceDraftSchema.extend({
  id: z.uuid(), digest,
  createdAt: z.iso.datetime(), status: z.enum(['pending', 'accepted', 'revoked']),
  acceptedAt: z.iso.datetime().optional(), revokedAt: z.iso.datetime().optional(),
}).superRefine((value, ctx) => {
  if ((value.status === 'accepted' || value.status === 'revoked') && !value.acceptedAt) ctx.addIssue({ code: 'custom', message: 'Пример не имеет записи явного принятия.' })
  if (value.status === 'pending' && (value.acceptedAt || value.revokedAt)) ctx.addIssue({ code: 'custom', message: 'Черновик не может иметь отметки принятия.' })
  if ((value.status === 'revoked') !== !!value.revokedAt) ctx.addIssue({ code: 'custom', message: 'Некорректная отметка отзыва примера.' })
})
export const processContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(150),
  instructions: z.strictObject({
    planner: z.string().trim().max(3000), writer: z.string().trim().max(3000), reviewer: z.string().trim().max(3000),
  }),
  settings: processSettingsSchema,
  voiceExampleIds: z.array(z.uuid()).max(3),
}).superRefine((value, ctx) => {
  if (new Set(value.voiceExampleIds).size !== value.voiceExampleIds.length) ctx.addIssue({ code: 'custom', message: 'Пример выбран дважды.' })
})
export const processVersionSchema = z.strictObject({
  id: z.uuid(), number: z.number().int().positive(), createdAt: z.iso.datetime(),
  content: processContentSchema, digest,
})
export const processLibrarySchema = z.strictObject({
  schemaVersion: z.literal('0.5.5'), profileId: z.enum(profileIds), revision: z.number().int().nonnegative(),
  versions: z.array(processVersionSchema).max(50),
  examples: z.array(voiceExampleSchema).max(100),
  selectedVersionId: z.uuid().nullable(),
}).superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (new Set(value.versions.map(item => item.id)).size !== value.versions.length || new Set(value.examples.map(item => item.id)).size !== value.examples.length) fail('Повторяющиеся ID библиотеки.')
  if (value.versions.some((item, i) => item.number !== i + 1)) fail('Нарушен порядок версий.')
  if (value.selectedVersionId && !value.versions.some(item => item.id === value.selectedVersionId)) fail('Выбранная версия отсутствует.')
  for (const version of value.versions) if (version.content.voiceExampleIds.some(id => !value.examples.some(item => item.id === id))) fail('Пример версии отсутствует.')
})
export const processSnapshotSchema = z.strictObject({
  schemaVersion: z.literal('0.5.5'), profileId: z.enum(profileIds),
  version: processVersionSchema, examples: z.array(voiceExampleSchema).max(3), digest,
})
export type ProcessLibrary = z.infer<typeof processLibrarySchema>
export type ProcessSnapshot = z.infer<typeof processSnapshotSchema>

/** Portable integrity check; native service separately enforces current permissions. */
export async function verifyProcessSnapshot(input: unknown): Promise<ProcessSnapshot> {
  const snapshot = processSnapshotSchema.parse(input)
  const sha = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
  const { digest: expected, ...content } = snapshot
  if (await sha(JSON.stringify(content)) !== expected || await sha(JSON.stringify(snapshot.version.content)) !== snapshot.version.digest) throw new Error('Снимок редакционных настроек повреждён.')
  const ids = snapshot.version.content.voiceExampleIds
  if (snapshot.examples.length !== ids.length || snapshot.examples.some((example, index) => example.id !== ids[index] || example.status !== 'accepted')) throw new Error('Примеры снимка не соответствуют выбранной версии.')
  for (const example of snapshot.examples) if (await sha(example.text) !== example.digest) throw new Error('Текст принятого примера изменён.')
  return snapshot
}
