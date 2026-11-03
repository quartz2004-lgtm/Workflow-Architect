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

import type { EvaluationStore } from './store'
import type { BlindReviewStore } from './blind-review'
import { evaluationAttemptResult } from './execution'

/** Administrative transfer only: never creates ratings or approves a runtime Human node. */
export function prepareEvaluationReviews(options: {
  attempts: EvaluationStore; reviews: BlindReviewStore; suiteId: string; profileDigest: string
  references: ReadonlyMap<string, string>
}) {
  const records = options.attempts.list().filter(record => record.attempt.suiteId === options.suiteId
    && record.attempt.profileDigest === options.profileDigest)
  const suite = records[0]?.suite
  if (!suite) throw new Error('Нет результатов выбранного процесса и набора.')
  const holdout = records.filter(record => record.attempt.phase === 'holdout')
  const expectedAttempts = suite.cases.filter(task => task.split === 'holdout').length * suite.seeds.length
  const pairs: { id: string; runId: string; raterId: string }[] = []
  let unfinished = 0, failed = 0
  for (const record of holdout) {
    if (['planner', 'writer', 'reviewer'].includes(record.attempt.state.phase)) { unfinished++; continue }
    const run = evaluationAttemptResult(record.attempt)
    if (run.status !== 'complete') { failed++; continue }
    const referenceText = options.references.get(run.caseId)
    const resultText = record.attempt.state.versions.at(-1)?.text
    if (!referenceText || !resultText) throw new Error('Отсутствует точный эталон или текст результата.')
    for (const raterId of suite.raters) {
      const id = options.reviews.ensure({ suite: record.suite, run, packet: record.packet, resultText, referenceText, raterId })
      pairs.push({ id, runId: run.id, raterId })
    }
  }
  return { expectedAttempts, missingAttempts: expectedAttempts - holdout.length, unfinished, failed,
    expectedPairs: expectedAttempts * suite.raters.length, pairs }
}
