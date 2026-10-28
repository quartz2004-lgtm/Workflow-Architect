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
import { agentKnowledgeSchema } from '../domain/knowledge-config'
import { mediaRecordSchema } from './media-schema'

export const knowledgeLimits = { documents: 200, documentBytes: 512 * 1024, snapshotBytes: 6 * 1024 * 1024, history: 3 } as const
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const knowledgePathSchema = z.string().min(1).max(300).refine(value => !value.includes('\\') && !value.includes(':') && !value.startsWith('/') && value.split('/').every(part => part !== '.' && part !== '..' && part.length > 0), 'Недопустимый относительный путь')
export const knowledgeFactSchema = z.strictObject({
  sourceId: z.string().max(200), sku: z.string().max(200).nullable(),
  approval: z.string().max(500).nullable(), scope: z.string().max(2000).nullable(),
})
export const knowledgeDocumentSchema = z.strictObject({
  id: z.uuid(), path: knowledgePathSchema, hash, bytes: z.number().int().nonnegative().max(knowledgeLimits.documentBytes),
  format: z.enum(['markdown', 'json']), content: z.string().max(knowledgeLimits.documentBytes),
  facts: z.array(knowledgeFactSchema).max(2000),
})
export const knowledgeSnapshotSchema = z.strictObject({
  schemaVersion: z.literal('0.5.2'), id: z.uuid(), createdAt: z.iso.datetime(), digest: hash,
  sourceVersion: z.string().min(1).max(200), documents: z.array(knowledgeDocumentSchema).min(1).max(knowledgeLimits.documents),
})
export const knowledgeCollectionSchema = z.strictObject({
  schemaVersion: z.literal('0.5.2'), id: z.uuid(), profileId: z.enum(profileIds), label: z.string().trim().min(1).max(80),
  sourcePath: z.string().max(2000), revision: z.number().int().nonnegative(), enabled: z.boolean(),
  selectedPaths: z.array(knowledgePathSchema).min(1).max(knowledgeLimits.documents),
  snapshots: z.array(knowledgeSnapshotSchema).min(1).max(knowledgeLimits.history),
})
export const knowledgeBackupSchema = z.strictObject({
  schemaVersion: z.literal('0.5.2'), kind: z.literal('workflow-knowledge-backup'), label: z.string().trim().min(1).max(80),
  selectedPaths: knowledgeCollectionSchema.shape.selectedPaths, snapshots: knowledgeCollectionSchema.shape.snapshots,
})
const owned = { profileId: z.enum(profileIds), id: z.uuid() }
const versioned = { ...owned, revision: z.number().int().nonnegative() }
export const knowledgeCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('product-list'), profileId: z.enum(profileIds), collections: agentKnowledgeSchema.shape.collections.optional() }),
  z.strictObject({ kind: z.literal('image-list'), profileId: z.enum(profileIds) }),
  z.strictObject({ kind: z.literal('image-import'), profileId: z.enum(profileIds), label: mediaRecordSchema.shape.label, sku: mediaRecordSchema.shape.sku }),
  z.strictObject({ kind: z.literal('image-inspect'), ...owned }),
  z.strictObject({ kind: z.literal('image-enable'), ...owned, enabled: z.boolean() }),
  z.strictObject({ kind: z.literal('image-remove'), ...owned }),
  z.strictObject({ kind: z.literal('context-preview'), profileId: z.enum(profileIds), settings: agentKnowledgeSchema, task: z.string().min(1).max(24000) }),
  z.strictObject({ kind: z.literal('list'), profileId: z.enum(profileIds) }),
  z.strictObject({ kind: z.literal('choose-folder') }),
  z.strictObject({ kind: z.literal('scan'), sourcePath: z.string().min(1).max(2000) }),
  z.strictObject({ kind: z.literal('prepare'), profileId: z.enum(profileIds), id: z.uuid().optional(), revision: z.number().int().nonnegative().optional(), label: knowledgeCollectionSchema.shape.label, sourcePath: z.string().min(1).max(2000), selectedPaths: knowledgeCollectionSchema.shape.selectedPaths }),
  z.strictObject({ kind: z.literal('commit'), profileId: z.enum(profileIds), token: z.uuid() }),
  z.strictObject({ kind: z.literal('preview-document'), profileId: z.enum(profileIds), token: z.uuid(), documentId: z.uuid() }),
  z.strictObject({ kind: z.literal('inspect'), ...owned, snapshotId: z.uuid(), documentId: z.uuid() }),
  z.strictObject({ kind: z.literal('enable'), ...versioned, enabled: z.boolean() }),
  z.strictObject({ kind: z.literal('prune'), ...versioned }),
  z.strictObject({ kind: z.literal('remove'), ...versioned }),
  z.strictObject({ kind: z.literal('backup'), ...owned }),
  z.strictObject({ kind: z.literal('restore'), profileId: z.enum(profileIds) }),
])
export const knowledgeDocumentViewSchema = knowledgeDocumentSchema.omit({ content: true })
export const knowledgeSnapshotViewSchema = knowledgeSnapshotSchema.extend({ documents: z.array(knowledgeDocumentViewSchema) })
export const knowledgeViewSchema = knowledgeCollectionSchema.extend({ snapshots: z.array(knowledgeSnapshotViewSchema), sourceAvailable: z.boolean() })
export const knowledgeListSchema = z.strictObject({ collections: z.array(knowledgeViewSchema), damaged: z.number().int().nonnegative() })
export const knowledgeScanSchema = z.strictObject({ sourcePath: z.string(), files: z.array(z.strictObject({ path: knowledgePathSchema, recommended: z.boolean() })), excluded: z.number().int().nonnegative() })
export const knowledgePreviewSchema = z.strictObject({ token: z.uuid(), expiresAt: z.iso.datetime(), snapshot: knowledgeSnapshotViewSchema, added: z.array(z.string()), changed: z.array(z.string()), removed: z.array(z.string()) })
export type KnowledgeCollection = z.infer<typeof knowledgeCollectionSchema>
export type KnowledgeSnapshot = z.infer<typeof knowledgeSnapshotSchema>
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>
export type KnowledgeCommand = z.infer<typeof knowledgeCommandSchema>
export type KnowledgeView = z.infer<typeof knowledgeViewSchema>
export type KnowledgePreview = z.infer<typeof knowledgePreviewSchema>
export type KnowledgeScan = z.infer<typeof knowledgeScanSchema>
