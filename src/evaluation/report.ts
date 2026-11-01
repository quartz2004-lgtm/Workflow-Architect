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
import { evaluationKinds, evaluationRatingSchema, evaluationRunSchema, evaluationSuiteSchema, evaluationSuiteDigest } from './schema'

/** No best-seed selection: all predeclared attempts stay in the denominator. */
export async function assessEvaluation(input: {
  suite: unknown; profileDigest: string; runs: unknown; ratings: unknown
}) {
  const suite = evaluationSuiteSchema.parse(input.suite)
  const suiteDigest = await evaluationSuiteDigest(suite)
  const profileDigest = z.string().regex(/^[a-f0-9]{64}$/).parse(input.profileDigest)
  const runs = z.array(evaluationRunSchema).parse(input.runs)
  const ratings = z.array(evaluationRatingSchema).parse(input.ratings)
  const taskById = new Map(suite.cases.map(task => [task.id, task]))
  const runById = new Map(runs.map(run => [run.id, run]))
  if (runById.size !== runs.length) throw new Error('Duplicate run ID.')
  const byAttempt = new Map<string, typeof runs[number]>()
  for (const run of runs) {
    const task = taskById.get(run.caseId)
    if (!task || run.suiteId !== suite.id || run.suiteDigest !== suiteDigest || run.profileDigest !== profileDigest || run.packetDigest !== task.packetDigest || !suite.seeds.includes(run.seed)) throw new Error('Run does not belong to the frozen comparison.')
    const key = `${run.caseId}:${run.seed}`
    if (byAttempt.has(key)) throw new Error('Duplicate attempt; select a new experiment instead of the best retry.')
    byAttempt.set(key, run)
  }
  const byRating = new Map<string, typeof ratings[number]>()
  for (const rating of ratings) {
    const run = runById.get(rating.runId)
    const task = run && taskById.get(run.caseId)
    if (!run || run.status !== 'complete' || !task || task.split !== 'holdout' || !suite.raters.includes(rating.raterId) || rating.resultDigest !== run.resultDigest || rating.referenceDigest !== task.reference.digest) throw new Error('Rating does not match the exact holdout result/reference.')
    const key = `${run.id}:${rating.raterId}`
    if (byRating.has(key)) throw new Error('Duplicate human rating.')
    byRating.set(key, rating)
  }
  const expected = suite.cases.length * suite.seeds.length
  const holdout = suite.cases.filter(task => task.split === 'holdout')
  const expectedHoldout = holdout.length * suite.seeds.length
  const expectedRatings = expectedHoldout * suite.raters.length
  const formalPassed = runs.filter(run => run.status === 'complete' && run.formalPassed).length
  const acceptedAttempts = holdout.reduce((count, task) => count + suite.seeds.filter(seed => {
    const run = byAttempt.get(`${task.id}:${seed}`)
    return run?.status === 'complete' && suite.raters.every(rater => byRating.get(`${run.id}:${rater}`)?.acceptedWithMinorEdits === true)
  }).length, 0)
  const missingRuns = expected - runs.length
  const missingRatings = expectedRatings - ratings.length
  const unsupportedClaims = ratings.filter(rating => rating.unsupportedProductOrMedicalClaim).length
  const nonInferiorPairs = ratings.filter(rating => rating.overallVsReference !== 'worse').length
  const accuracyLosses = ratings.filter(rating => rating.accuracyVsReference === 'worse').length
  const formalRate = formalPassed / expected
  const acceptanceRate = acceptedAttempts / expectedHoldout
  const nonInferiorityRate = nonInferiorPairs / expectedRatings
  const evidenceComplete = missingRuns === 0 && missingRatings === 0
  const qualityGatePassed = evidenceComplete && formalRate >= 0.9 && unsupportedClaims === 0 && acceptanceRate >= 0.8
  return {
    expected, formalPassed, formalRate, missingRuns, expectedRatings, missingRatings,
    acceptedAttempts, acceptanceRate, unsupportedClaims, accuracyLosses, nonInferiorityRate,
    evidenceComplete, qualityGatePassed,
    comparableToReference: qualityGatePassed && accuracyLosses === 0 && nonInferiorityRate >= 0.8,
    capabilities: evaluationKinds.map(kind => {
      const tasks = suite.cases.filter(task => task.kind === kind)
      const ids = new Set(tasks.map(task => task.id))
      const relevant = runs.filter(run => ids.has(run.caseId))
      return { kind, expected: tasks.length * suite.seeds.length, completed: relevant.filter(run => run.status === 'complete').length, formalPassed: relevant.filter(run => run.formalPassed).length }
    }),
  }
}
