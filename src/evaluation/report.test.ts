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

import { describe, expect, it } from 'vitest'
import { assessEvaluation } from './report'
import { evaluationInput, evaluationKinds, evaluationSuiteSchema, evaluationSuiteDigest, type EvaluationRating, type EvaluationRun } from './schema'

const hash = 'a'.repeat(64), otherHash = 'b'.repeat(64)
const time = '2026-11-01T00:00:00.000Z'
function suiteFixture() {
  return evaluationSuiteSchema.parse({
    schemaVersion: '0.5.5', id: crypto.randomUUID(), createdAt: time,
    raters: [crypto.randomUUID(), crypto.randomUUID()], seeds: [17, 53],
    cases: evaluationKinds.flatMap(kind => Array.from({ length: 5 }, (_, index) => ({
      id: crypto.randomUUID(), kind, split: index < 3 ? 'development' : 'holdout',
      prompt: `${kind} task ${index}`, ...(kind === 'revision' ? { previousText: 'Original facts.' } : {}),
      contract: { minimumWords: kind === 'article' ? 600 : 100, minimumSections: kind === 'article' ? 2 : 0, ...(kind === 'short-block' ? { maximumWords: 130 } : {}) },
      packetDigest: hash, reference: { digest: otherHash, packetDigest: hash, verifiedBy: 'Test fixture only', verifiedAt: time },
    }))),
  })
}
async function fullFixture() {
  const suite = suiteFixture(), suiteDigest = await evaluationSuiteDigest(suite)
  const runs: EvaluationRun[] = suite.cases.flatMap(task => suite.seeds.map(seed => ({
    id: crypto.randomUUID(), suiteId: suite.id, suiteDigest, caseId: task.id, profileDigest: hash, packetDigest: hash,
    seed, status: 'complete', resultDigest: hash, formalPassed: true,
  })))
  const ratings: EvaluationRating[] = runs.filter(run => suite.cases.find(task => task.id === run.caseId)!.split === 'holdout').flatMap(run => suite.raters.map(raterId => ({
    runId: run.id, raterId, resultDigest: hash, referenceDigest: otherHash, submittedAt: time, blind: true,
    unsupportedProductOrMedicalClaim: false, acceptedWithMinorEdits: true,
    accuracyVsReference: 'equal', overallVsReference: 'equal', scores: { accuracy: 8, usefulness: 8, naturalness: 8, structure: 8 }, notes: 'Synthetic test; not human acceptance.',
  })))
  return { suite, profileDigest: hash, runs, ratings }
}

describe('frozen evaluation and honest release gates', () => {
  it('does not pass an empty experiment or invent scores for absent attempts', async () => {
    const report = await assessEvaluation({ suite: suiteFixture(), profileDigest: hash, runs: [], ratings: [] })
    expect(report).toMatchObject({ expected: 60, missingRuns: 60, expectedRatings: 48, missingRatings: 48, formalRate: 0, qualityGatePassed: false, comparableToReference: false })
  })
  it('requires both humans, all seeds and the complete matrix', async () => {
    const input = await fullFixture()
    expect(await assessEvaluation(input)).toMatchObject({ qualityGatePassed: true, comparableToReference: true })
    input.ratings.pop()
    expect(await assessEvaluation(input)).toMatchObject({ missingRatings: 1, qualityGatePassed: false })
  })
  it('keeps failed development attempts in the formal denominator', async () => {
    const input = await fullFixture()
    for (const run of input.runs.filter(run => input.suite.cases.find(task => task.id === run.caseId)!.split === 'development').slice(0, 7)) {
      run.status = 'failed'; run.formalPassed = false; delete run.resultDigest
    }
    expect(await assessEvaluation(input)).toMatchObject({ formalPassed: 53, formalRate: 53 / 60, evidenceComplete: true, qualityGatePassed: false })
  })
  it('cannot replace a failed seed by a successful retry', async () => {
    const input = await fullFixture()
    input.runs.push({ ...input.runs[0]!, id: crypto.randomUUID() })
    await expect(assessEvaluation(input)).rejects.toThrow('Duplicate attempt')
  })
  it('rejects stale text ratings, changed packets, profiles and suite prompts', async () => {
    const input = await fullFixture()
    const stale = structuredClone(input); stale.ratings[0]!.resultDigest = otherHash
    await expect(assessEvaluation(stale)).rejects.toThrow('exact holdout')
    for (const field of ['packetDigest', 'profileDigest', 'suiteDigest'] as const) {
      const changed = structuredClone(input); changed.runs[0]![field] = otherHash
      await expect(assessEvaluation(changed)).rejects.toThrow('frozen comparison')
    }
    input.suite.cases[0]!.prompt += ' changed'
    await expect(assessEvaluation(input)).rejects.toThrow('frozen comparison')
  })
  it('a single unsupported claim blocks quality even if both users accept the writing', async () => {
    const input = await fullFixture(); input.ratings[0]!.unsupportedProductOrMedicalClaim = true
    expect(await assessEvaluation(input)).toMatchObject({ acceptanceRate: 1, unsupportedClaims: 1, qualityGatePassed: false })
  })
  it('does not equate acceptable output with reference parity', async () => {
    const input = await fullFixture(); input.ratings[0]!.accuracyVsReference = 'worse'
    expect(await assessEvaluation(input)).toMatchObject({ qualityGatePassed: true, comparableToReference: false })
  })
  it('requires both participants to accept at least 80 percent of holdout attempts', async () => {
    const input = await fullFixture()
    for (let i = 0; i < 5; i++) input.ratings[i * 2]!.acceptedWithMinorEdits = false
    expect(await assessEvaluation(input)).toMatchObject({ acceptedAttempts: 19, acceptanceRate: 19 / 24, qualityGatePassed: false })
  })
  it('rejects duplicate identities, seed inflation and uncovered classes', () => {
    const input = suiteFixture()
    expect(evaluationSuiteSchema.safeParse({ ...input, raters: [input.raters[0], input.raters[0]] }).success).toBe(false)
    expect(evaluationSuiteSchema.safeParse({ ...input, seeds: [17, 17] }).success).toBe(false)
    input.cases[0]!.kind = 'content-plan'
    expect(evaluationSuiteSchema.safeParse(input).success).toBe(false)
  })
  it('never projects reference answers into a model task or uses holdout for development', () => {
    const suite = suiteFixture(), task = suite.cases.find(item => item.split === 'holdout')!
    expect(() => evaluationInput(suite, task.id, 'development')).toThrow('phase')
    const projected = evaluationInput(suite, task.id, 'holdout')
    expect(projected).not.toHaveProperty('reference')
    expect(JSON.stringify(projected)).not.toContain(otherHash)
  })
})
