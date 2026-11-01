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

export const evaluationKinds = ['knowledge-answer', 'article', 'revision', 'short-block', 'content-plan', 'reels'] as const
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const id = z.uuid()
const text = z.string().trim().min(1).max(12000)

export const evaluationCaseSchema = z.strictObject({
  id, kind: z.enum(evaluationKinds), split: z.enum(['development', 'holdout']),
  prompt: text, previousText: z.string().min(1).max(100000).optional(),
  contract: z.strictObject({
    minimumWords: z.number().int().nonnegative().max(5000),
    maximumWords: z.number().int().positive().max(10000).optional(),
    minimumSections: z.number().int().nonnegative().max(30),
    requiredItems: z.number().int().positive().max(100).optional(),
  }),
  packetDigest: digest,
  reference: z.strictObject({
    digest, packetDigest: digest, verifiedBy: text, verifiedAt: z.iso.datetime(),
  }),
}).superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (value.contract.maximumWords !== undefined && value.contract.maximumWords < value.contract.minimumWords) fail('Maximum words is below minimum.')
  if (value.kind === 'article' && value.contract.minimumWords < 600) fail('Articles require at least 600 words.')
  if (value.kind === 'short-block' && (value.contract.minimumWords !== 100 || value.contract.maximumWords !== 130)) fail('Short blocks require 100–130 words.')
  if (value.kind === 'revision' && !value.previousText) fail('Revision requires the original text.')
  if (value.packetDigest !== value.reference.packetDigest) fail('Reference must use the same source packet.')
})

/** Frozen before running a holdout. References are never model input. */
export const evaluationSuiteSchema = z.strictObject({
  schemaVersion: z.literal('0.5.5'), id, createdAt: z.iso.datetime(),
  cases: z.array(evaluationCaseSchema).min(30).max(500),
  seeds: z.array(z.number().int().min(0).max(2147483647)).min(2).max(10),
  raters: z.array(id).length(2),
}).superRefine((suite, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (new Set(suite.cases.map(item => item.id)).size !== suite.cases.length) fail('Duplicate case ID.')
  if (new Set(suite.cases.map(item => item.prompt.replace(/\s+/g, ' ').toLowerCase())).size !== suite.cases.length) fail('Duplicate task across the suite.')
  if (new Set(suite.seeds).size !== suite.seeds.length) fail('Duplicate seed.')
  if (new Set(suite.raters).size !== suite.raters.length) fail('Two distinct human raters are required.')
  for (const kind of evaluationKinds) {
    if (suite.cases.filter(item => item.kind === kind && item.split === 'development').length < 3) fail(`Missing development coverage: ${kind}.`)
    if (suite.cases.filter(item => item.kind === kind && item.split === 'holdout').length < 2) fail(`Missing holdout coverage: ${kind}.`)
  }
})
export type EvaluationSuite = z.infer<typeof evaluationSuiteSchema>

export async function evaluationSuiteDigest(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(evaluationSuiteSchema.parse(input)))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export const evaluationRunSchema = z.strictObject({
  id, suiteId: id, suiteDigest: digest, caseId: id, profileDigest: digest, packetDigest: digest,
  seed: z.number().int().min(0).max(2147483647),
  status: z.enum(['complete', 'failed', 'cancelled', 'interrupted']),
  resultDigest: digest.optional(), formalPassed: z.boolean(),
}).superRefine((run, ctx) => {
  if (run.status === 'complete' && !run.resultDigest) ctx.addIssue({ code: 'custom', message: 'Completed run requires the exact result digest.' })
  if (run.status !== 'complete' && run.formalPassed) ctx.addIssue({ code: 'custom', message: 'Unfinished run cannot pass formal checks.' })
})
export type EvaluationRun = z.infer<typeof evaluationRunSchema>

/** Human evidence is separate from model reviewer output. Bind it to exact text. */
export const evaluationRatingSchema = z.strictObject({
  runId: id, raterId: id, resultDigest: digest, referenceDigest: digest,
  submittedAt: z.iso.datetime(), blind: z.literal(true),
  unsupportedProductOrMedicalClaim: z.boolean(),
  acceptedWithMinorEdits: z.boolean(),
  accuracyVsReference: z.enum(['worse', 'equal', 'better']),
  overallVsReference: z.enum(['worse', 'equal', 'better']),
  scores: z.strictObject({
    accuracy: z.number().int().min(1).max(10), usefulness: z.number().int().min(1).max(10),
    naturalness: z.number().int().min(1).max(10), structure: z.number().int().min(1).max(10),
  }),
  notes: z.string().max(12000),
})
export type EvaluationRating = z.infer<typeof evaluationRatingSchema>

/** Explicit projection excludes the reference and rater records from model input. */
export function evaluationInput(suite: EvaluationSuite, caseId: string, phase: 'development' | 'holdout') {
  const parsed = evaluationSuiteSchema.parse(suite)
  const task = parsed.cases.find(item => item.id === caseId)
  if (!task || task.split !== phase) throw new Error('Task is not available in this evaluation phase.')
  return { id: task.id, kind: task.kind, prompt: task.prompt, contract: task.contract, packetDigest: task.packetDigest, ...(task.previousText ? { previousText: task.previousText } : {}) }
}
