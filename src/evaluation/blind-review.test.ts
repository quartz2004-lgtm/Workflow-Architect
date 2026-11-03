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

import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BlindReviewStore } from './blind-review'
import { evaluationKinds, evaluationSuiteSchema, type EvaluationRun } from './schema'
import { contextPacketSchema } from '../knowledge/context'
import { profileIds } from '../profiles/schema'

const hashText = (text: string) => createHash('sha256').update(text).digest('hex')
const hash = (value: unknown) => hashText(JSON.stringify(value))
const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })
function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'workflow-blind-test-')); folders.push(folder)
  const packet = contextPacketSchema.parse({ schemaVersion: '0.5.3', profileId: profileIds[0], runId: randomUUID(), task: 'Test', query: 'Test', excerpts: [], gaps: [], budgetBytes: 16000 })
  const resultText = 'Synthetic result, not user acceptance.', referenceText = 'Synthetic reference, not a real approved article.'
  const suite = evaluationSuiteSchema.parse({ schemaVersion: '0.5.5', id: randomUUID(), createdAt: '2026-11-02T00:00:00.000Z', seeds: [17, 53], raters: [randomUUID(), randomUUID()],
    cases: evaluationKinds.flatMap(kind => Array.from({ length: 5 }, (_, index) => ({
      id: randomUUID(), kind, split: index < 3 ? 'development' : 'holdout', prompt: `${kind} ${index}`,
      ...(kind === 'revision' ? { previousText: 'Old text' } : {}),
      contract: { minimumWords: kind === 'article' ? 600 : 100, minimumSections: kind === 'article' ? 2 : 0, ...(kind === 'short-block' ? { maximumWords: 130 } : {}) },
      packetDigest: hash(packet), reference: { digest: hashText(referenceText), packetDigest: hash(packet), verifiedBy: 'Synthetic fixture', verifiedAt: '2026-11-02T00:00:00.000Z' },
    }))),
  })
  const run: EvaluationRun = { id: randomUUID(), suiteId: suite.id, suiteDigest: hash(suite), caseId: suite.cases[3]!.id, profileDigest: 'a'.repeat(64), packetDigest: hash(packet), seed: 17, status: 'complete', resultDigest: hashText(resultText), formalPassed: true }
  const input = { suite, run, packet, resultText, referenceText, raterId: suite.raters[0]! }
  return { folder, store: new BlindReviewStore(folder), input }
}
const answer = {
  A: { scores: { accuracy: 8, usefulness: 7, naturalness: 6, structure: 9 }, unsupportedProductOrMedicalClaim: false, acceptedWithMinorEdits: true },
  B: { scores: { accuracy: 3, usefulness: 4, naturalness: 5, structure: 6 }, unsupportedProductOrMedicalClaim: true, acceptedWithMinorEdits: false },
  accuracyPreference: 'A', overallPreference: 'B', notes: 'Synthetic rating only.',
}

describe('durable blind human review', () => {
  it('resumes pair preparation without rerandomizing sides or replacing submitted evidence', () => {
    const { store, input, folder } = setup()
    const id = store.ensure(input), view = store.open(id, input.raterId)
    expect(store.ensure(input)).toBe(id)
    expect(store.open(id, input.raterId)).toEqual(view)
    store.submit(id, input.raterId, view.digest, answer)
    const restarted = new BlindReviewStore(folder), ratings = restarted.ratings()
    expect(restarted.ensure(input)).toBe(id)
    expect(restarted.ratings()).toEqual(ratings)
    const changed = { ...input, resultText: 'Different validly hashed text',
      run: { ...input.run, resultDigest: hashText('Different validly hashed text') } }
    expect(() => restarted.ensure(changed)).toThrow('замена запрещена')
    expect(restarted.open(id, input.raterId)).toEqual({ ...view, submitted: true })
  })
  it('keeps origins private, maps either randomized side correctly and survives restart', () => {
    const { store, input, folder } = setup(), id = store.create(input)
    const view = store.open(id, input.raterId)
    expect(Object.keys(view).sort()).toEqual(['id', 'digest', 'submitted', 'kind', 'prompt', 'contract', 'previousText', 'sources', 'gaps', 'A', 'B'].sort())
    expect(new Set([view.A, view.B])).toEqual(new Set([input.resultText, input.referenceText]))
    expect(store.submit(id, input.raterId, view.digest, answer)).toEqual({ id, submitted: true })
    const restarted = new BlindReviewStore(folder)
    expect(restarted.open(id, input.raterId)).toEqual({ ...view, submitted: true })
    expect(restarted.ratings()[0]).toMatchObject({
      runId: input.run.id, raterId: input.raterId, resultDigest: input.run.resultDigest,
      scores: view.A === input.resultText ? answer.A.scores : answer.B.scores,
      accuracyVsReference: view.A === input.resultText ? 'better' : 'worse',
      overallVsReference: view.A === input.resultText ? 'worse' : 'better',
    })
    expect(() => restarted.submit(id, input.raterId, view.digest, answer)).toThrow('уже сохранена')
    expect(() => restarted.create(input)).toThrow('уже создана')
  })
  it('rejects another participant, stale pair and malformed rating before writing', () => {
    const { store, input } = setup(), id = store.create(input), view = store.open(id, input.raterId)
    expect(() => store.open(id, input.suite.raters[1]!)).toThrow('другому')
    expect(() => store.submit(id, input.suite.raters[1]!, view.digest, answer)).toThrow('другому')
    expect(() => store.submit(id, input.raterId, 'b'.repeat(64), answer)).toThrow('изменились')
    expect(() => store.submit(id, input.raterId, view.digest, { ...answer, modelSide: 'A' })).toThrow()
    expect(store.ratings()).toEqual([])
  })
  it('rejects modified texts, non-control tasks and unfinished runs', () => {
    const { store, input } = setup()
    expect(() => store.create({ ...input, resultText: 'Changed' })).toThrow('не соответствует')
    expect(() => store.create({ ...input, referenceText: 'Changed' })).toThrow('не соответствует')
    expect(() => store.create({ ...input, run: { ...input.run, caseId: input.suite.cases[0]!.id } })).toThrow('не соответствует')
    expect(() => store.create({ ...input, run: { ...input.run, status: 'failed', formalPassed: false } })).toThrow('не соответствует')
  })
  it('detects stored text corruption without replacing the record', () => {
    const { store, input, folder } = setup(), id = store.create(input), path = join(folder, `${id}.json`)
    const record = JSON.parse(readFileSync(path, 'utf8')) as { pair: { resultText: string } }
    record.pair.resultText += ' corrupted'
    writeFileSync(path, JSON.stringify(record))
    expect(() => store.open(id, input.raterId)).toThrow('повреждена')
    expect(readFileSync(path, 'utf8')).toContain('corrupted')
  })
})
