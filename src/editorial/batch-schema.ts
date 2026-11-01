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
import { projectSchema } from '../domain/schema'
import { editorialTaskSchema } from './schema'

export const batchRequestSchema = z.strictObject({
  id: z.uuid(), profileId: z.enum(profileIds), project: projectSchema, entryNodeId: z.uuid(), background: z.boolean(),
  items: z.array(z.strictObject({ id: z.uuid(), task: editorialTaskSchema })).min(1).max(10),
}).superRefine((value, ctx) => {
  if (new Set(value.items.map(item => item.id)).size !== value.items.length) ctx.addIssue({ code: 'custom', message: 'ID материалов должны различаться.' })
})
export const editorialBatchSchema = z.strictObject({
  schemaVersion: z.literal('0.5.5'), request: batchRequestSchema, fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(), cancelled: z.boolean(),
  items: z.array(z.strictObject({ id: z.uuid(), submitted: z.boolean(), error: z.string().max(4000) })).min(1).max(10),
})
const owned = { profileId: z.enum(profileIds), id: z.uuid() }
export const batchCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('submit'), request: batchRequestSchema }),
  z.strictObject({ action: z.literal('list'), profileId: z.enum(profileIds) }),
  z.strictObject({ action: z.literal('retry'), ...owned }),
  z.strictObject({ action: z.literal('cancel'), ...owned }),
])
export type EditorialBatch = z.infer<typeof editorialBatchSchema>
