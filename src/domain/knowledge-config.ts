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

/** Exportable references only. Actual knowledge, permissions and image bytes are profile-local. */
export const agentKnowledgeSchema = z.strictObject({
  collections: z.array(z.strictObject({ collectionId: z.uuid(), snapshotId: z.uuid().optional() })).max(4)
    .refine(items => new Set(items.map(item => item.collectionId)).size === items.length, 'Коллекции не должны повторяться.'),
  imageIds: z.array(z.uuid()).max(2).refine(items => new Set(items).size === items.length, 'Изображения не должны повторяться.'),
  query: z.string().trim().max(4000), sku: z.string().trim().max(200),
  sourceIds: z.array(z.string().trim().min(1).max(200)).max(30),
  maxBytes: z.number().int().min(1024).max(96000), maxExcerpts: z.number().int().min(1).max(40),
})
export type AgentKnowledge = z.infer<typeof agentKnowledgeSchema>
export const defaultAgentKnowledge: AgentKnowledge = { collections: [], imageIds: [], query: '', sku: '', sourceIds: [], maxBytes: 8000, maxExcerpts: 8 }
