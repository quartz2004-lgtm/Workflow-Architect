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

import { expect, it } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { evaluationSuiteSchema } from './schema'
import { EvaluationStore } from './store'
import { BlindReviewStore } from './blind-review'
import { assessEvaluation } from './report'
import { evaluationAttemptResult } from './execution'
import { measureSentenceRepetition } from './repetition'

/** Read-only with respect to all model attempts, reviews and experiment selection. */
it.runIf(!!process.env.WORKFLOW_EVALUATION_REPORT_SUITE)('exports current evidence without generating or rating text', async () => {
  const suite = evaluationSuiteSchema.parse(JSON.parse(readFileSync(process.env.WORKFLOW_EVALUATION_REPORT_SUITE!, 'utf8').replace(/^\uFEFF/, '')))
  const directory = resolve('output/evaluation-0.5.5', `series-${suite.id}`)
  const store = new EvaluationStore(join(directory, 'attempts'))
  const records = store.list().filter(record => record.suite.id === suite.id)
  const runs = records.filter(record => !['planner', 'writer', 'reviewer'].includes(record.attempt.state.phase))
    .map(record => evaluationAttemptResult(record.attempt))
  const ratings = new BlindReviewStore(join(directory, 'reviews')).ratings()
  const profiles = [...new Set(records.map(record => record.attempt.profileDigest))]
  const reports = []
  for (const profileDigest of profiles) {
    const selected = records.filter(record => record.attempt.profileDigest === profileDigest)
    const results = runs.filter(run => run.profileDigest === profileDigest)
    const ids = new Set(results.map(run => run.id))
    const assessment = await assessEvaluation({ suite, profileDigest, runs: results, ratings: ratings.filter(rating => ids.has(rating.runId)) })
    const calls = selected.flatMap(record => record.attempt.state.calls)
    reports.push({ profileDigest, assessment,
      invalidation: store.invalidations(suite.id).find(item => item.profileDigest === profileDigest) ?? null,
      started: selected.length, unfinished: selected.length - results.length,
      notStarted: assessment.expected - selected.length,
      failures: results.filter(result => result.status !== 'complete').map(result => ({ id: result.id, caseId: result.caseId, seed: result.seed, status: result.status })),
      representativeSettings: selected[0]!.attempt.state.settings, declaredSeeds: suite.seeds,
      processDigest: selected[0]!.attempt.state.process?.digest ?? null,
      // All saved versions, including failed/unfinished attempts. No acceptance threshold.
      repetitionDiagnostics: selected.flatMap(record => record.attempt.state.versions.map(version => ({
        recordId: record.id, versionId: version.id, digest: version.digest,
        ...measureSentenceRepetition(version.text),
      }))),
      calls: { total: calls.length, withMetrics: calls.filter(call => call.metrics).length,
        completedDurationMs: calls.reduce((sum, call) => sum + (call.metrics?.durationMs ?? 0), 0),
        inputTokens: calls.reduce((sum, call) => sum + (call.metrics?.inputTokens ?? 0), 0),
        outputTokens: calls.reduce((sum, call) => sum + (call.metrics?.outputTokens ?? 0), 0) },
    })
  }
  const output = join(directory, 'reports', `${randomUUID()}.json`)
  expect(reports.every(report => report.unfinished >= 0 && report.notStarted >= 0)).toBe(true)
  mkdirSync(join(directory, 'reports'), { recursive: true })
  writeFileSync(output, JSON.stringify({ createdAt: new Date().toISOString(), suiteId: suite.id,
    purpose: 'evidence-report-not-human-acceptance', metricScope: 'Only completed calls with recorded metrics; concurrent work may affect timings.', reports }, null, 2), { flag: 'wx' })
  console.log(JSON.stringify({ output, candidates: reports.length }))
})
