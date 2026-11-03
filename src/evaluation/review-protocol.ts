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
import { evaluationBriefSchema, evaluationRatingSchema } from './schema'
import { contextExcerptSchema, contextPacketSchema } from '../knowledge/context'

const sideSchema = z.strictObject({
  scores: evaluationRatingSchema.shape.scores,
  unsupportedProductOrMedicalClaim: z.boolean(), acceptedWithMinorEdits: z.boolean(),
})
export const blindReviewAnswerSchema = z.strictObject({
  A: sideSchema, B: sideSchema,
  accuracyPreference: z.enum(['A', 'B', 'equal']), overallPreference: z.enum(['A', 'B', 'equal']),
  notes: z.string().max(12000),
})
export type BlindReviewAnswer = z.infer<typeof blindReviewAnswerSchema>
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const owned = { profileId: z.enum(profileIds) }
export const reviewCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('list'), ...owned }),
  z.strictObject({ action: z.literal('open'), ...owned, id: z.uuid() }),
  z.strictObject({ action: z.literal('submit'), ...owned, id: z.uuid(), digest, answer: blindReviewAnswerSchema }),
])
export type ReviewCommand = z.infer<typeof reviewCommandSchema>
export const reviewListSchema = z.array(z.strictObject({ id: z.uuid(), submitted: z.boolean(), kind: evaluationBriefSchema.shape.kind, prompt: z.string() }))
export const reviewViewSchema = z.strictObject({
  id: z.uuid(), digest, submitted: z.boolean(), kind: evaluationBriefSchema.shape.kind,
  prompt: z.string(), contract: evaluationBriefSchema.shape.contract, previousText: z.string().optional(),
  sources: z.array(contextExcerptSchema), gaps: contextPacketSchema.shape.gaps,
  A: z.string(), B: z.string(),
})
export type ReviewView = z.infer<typeof reviewViewSchema>
