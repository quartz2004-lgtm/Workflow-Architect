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

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { importSnapshot, verifySnapshot, digest } from '../knowledge/importer'
import { buildContextPacket, contextPacketSchema } from '../knowledge/context'
import { knowledgeSnapshotSchema } from '../knowledge/schema'
import { profileIds } from '../profiles/schema'
import { evaluationBriefSchema } from './schema'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const evaluationSourcesSchema = z.strictObject({
  schemaVersion: z.literal('0.5.5'), id: z.uuid(), createdAt: z.iso.datetime(),
  collectionId: z.uuid(), snapshot: knowledgeSnapshotSchema,
  retrieval: z.strictObject({ algorithmVersion: z.literal('0.5.5-article-identifiers-v1'), maxBytes: z.number().int().min(1024).max(96000), maxExcerpts: z.number().int().min(1).max(40) }),
  tasks: z.array(z.strictObject({
    brief: evaluationBriefSchema, packet: contextPacketSchema, packetDigest: hash,
  })).min(1).max(500),
})
export type EvaluationSources = z.infer<typeof evaluationSourcesSchema>

/** Only snapshot bytes are used after import; no model, production profile or source writes. */
export async function captureEvaluationSources(input: {
  sourcePath: string; selectedPaths: string[]; tasks: unknown
  maxBytes: number; maxExcerpts: number
}): Promise<EvaluationSources> {
  const tasks = z.array(evaluationBriefSchema).min(1).max(500).parse(input.tasks)
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('Duplicate evaluation task.')
  const collectionId = randomUUID()
  const selectedPaths = [...new Set(input.selectedPaths)]
  const snapshot = await importSnapshot(input.sourcePath, selectedPaths, collectionId)
  const missing = selectedPaths.filter(path => !snapshot.documents.some(document => document.path === path))
  if (missing.length) throw new Error(`Selected sources are missing: ${missing.join(', ')}`)
  verifySnapshot(snapshot)
  const packets = tasks.map(brief => {
    const packet = buildContextPacket({
      profileId: profileIds[0], runId: randomUUID(), task: brief.prompt, query: brief.sourceQuery ?? brief.prompt,
      sourceIds: brief.sourceIds,
      maxBytes: input.maxBytes, maxExcerpts: input.maxExcerpts,
    }, [{ collectionId, snapshot }])
    return { brief, packet, packetDigest: digest(JSON.stringify(packet)) }
  })
  // A source edit during capture must not silently produce a mixed experimental baseline.
  const after = await importSnapshot(input.sourcePath, selectedPaths, collectionId)
  if (after.digest !== snapshot.digest) throw new Error('Sources changed during capture; prepare a new snapshot.')
  return evaluationSourcesSchema.parse({
    schemaVersion: '0.5.5', id: randomUUID(), createdAt: new Date().toISOString(), collectionId, snapshot,
    retrieval: { algorithmVersion: '0.5.5-article-identifiers-v1', maxBytes: input.maxBytes, maxExcerpts: input.maxExcerpts }, tasks: packets,
  })
}

/** Verify serialized evidence offline, including provenance and the exact retrieval outcome. */
export function verifyEvaluationSources(input: unknown): EvaluationSources {
  const bundle = evaluationSourcesSchema.parse(input)
  verifySnapshot(bundle.snapshot)
  if (new Set(bundle.tasks.map(task => task.brief.id)).size !== bundle.tasks.length) throw new Error('Duplicate evaluation task.')
  for (const task of bundle.tasks) {
    if (digest(JSON.stringify(task.packet)) !== task.packetDigest) throw new Error('Source packet digest mismatch.')
    const expected = buildContextPacket({
      profileId: task.packet.profileId, runId: task.packet.runId, task: task.brief.prompt, query: task.brief.sourceQuery ?? task.brief.prompt,
      sourceIds: task.brief.sourceIds,
      maxBytes: bundle.retrieval.maxBytes, maxExcerpts: bundle.retrieval.maxExcerpts,
    }, [{ collectionId: bundle.collectionId, snapshot: bundle.snapshot }])
    if (digest(JSON.stringify(expected)) !== task.packetDigest) throw new Error('Source packet does not match the frozen task and snapshot.')
  }
  return bundle
}
