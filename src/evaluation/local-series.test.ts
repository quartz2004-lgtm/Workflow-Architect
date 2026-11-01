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
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { randomUUID, createHash } from 'node:crypto'
import { verifyEvaluationSources } from './sources'
import { evaluationSuiteSchema } from './schema'
import { verifyProcessSnapshot } from '../editorial/process-schema'
import { EvaluationStore } from './store'
import { runEvaluationSeries } from './runner'
import { captureLocalEnvironment } from './telemetry'
import { OllamaProvider } from '../ai/ollama'
import { BlindReviewStore } from './blind-review'
import { prepareEvaluationReviews } from './prepare-reviews'

const configurationSchema = z.strictObject({
  sourcesPath: z.string().min(1), suitePath: z.string().min(1), referencesDirectory: z.string().min(1),
  phase: z.enum(['development', 'holdout']), processPath: z.string().min(1).optional(),
  model: z.string().min(1), modelDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const referenceSchema = z.object({ caseId: z.uuid(), sourceBundleId: z.uuid(), packetDigest: z.string(),
  referenceDigest: z.string(), text: z.string().min(1).max(100000), factCheckedBy: z.string().min(1), checkedAt: z.iso.datetime() })
const deadline = 24 * 60 * 60 * 1000

/** Explicit opt-in only: no production profile, Human approval or Telegram side effects. */
it.runIf(!!process.env.WORKFLOW_EVALUATION_SERIES_CONFIG)('runs or resumes a frozen local evaluation phase', async () => {
  const config = configurationSchema.parse(read(process.env.WORKFLOW_EVALUATION_SERIES_CONFIG!))
  const sources = verifyEvaluationSources(read(config.sourcesPath))
  const suite = evaluationSuiteSchema.parse(read(config.suitePath))
  expect(sources.tasks).toHaveLength(suite.cases.length)
  const references = new Map<string, string>()
  // Read-only reference verification: these texts are never passed to the runner/provider.
  for (const task of suite.cases) {
    const source = sources.tasks.find(item => item.brief.id === task.id)
    expect(source).toBeDefined()
    const { packetDigest, reference, ...brief } = task
    expect(brief).toEqual(source!.brief)
    expect(packetDigest).toBe(source!.packetDigest)
    const saved = referenceSchema.parse(read(join(config.referencesDirectory, `${task.id}.json`)))
    expect(saved).toMatchObject({ caseId: task.id, sourceBundleId: sources.id, packetDigest,
      referenceDigest: reference.digest, factCheckedBy: reference.verifiedBy, checkedAt: reference.verifiedAt })
    expect(digest(saved.text)).toBe(reference.digest)
    references.set(task.id, saved.text)
  }
  const processSnapshot = config.processPath ? await verifyProcessSnapshot(read(config.processPath)) : undefined
  if (process.env.WORKFLOW_EVALUATION_PREFLIGHT_ONLY === '1') {
    console.log(JSON.stringify({ purpose: 'preflight-only-no-model-calls', suiteId: suite.id,
      cases: suite.cases.length, sourceBundleId: sources.id, processDigest: processSnapshot?.digest ?? null }))
    return
  }
  const directory = resolve('output/evaluation-0.5.5', `series-${suite.id}`)
  const invocation = join(directory, randomUUID())
  mkdirSync(invocation, { recursive: true })
  const store = new EvaluationStore(join(directory, 'attempts'))
  writeFileSync(join(invocation, 'manifest.json'), JSON.stringify({ config, suiteDigest: digest(JSON.stringify(suite)),
    sourceBundleId: sources.id, processDigest: processSnapshot?.digest ?? null, startedAt: new Date().toISOString(),
    before: await captureLocalEnvironment() }, null, 2), { flag: 'wx' })
  const provider = new OllamaProvider({ provider: 'ollama', port: 11434, model: config.model })
  const summary = await runEvaluationSeries({ store, suite, phase: config.phase,
    packets: new Map(sources.tasks.map(task => [task.brief.id, task.packet])), process: processSnapshot, provider,
    settings: { model: config.model, modelDigest: config.modelDigest, contextTokens: 32768,
      maxOutputTokens: 4096, temperature: 0.3, callTimeoutMs: 300000 },
    signal: AbortSignal.timeout(deadline), onCheckpoint: async record => {
      appendFileSync(join(invocation, 'environment.jsonl'), JSON.stringify({ recordId: record.id, revision: record.revision,
        phase: record.attempt.state.phase, environment: await captureLocalEnvironment() }) + '\n')
    },
  })
  writeFileSync(join(invocation, 'summary.json'), JSON.stringify({ ...summary,
    completedAt: new Date().toISOString(), after: await captureLocalEnvironment() }, null, 2), { flag: 'wx' })
  if (config.phase === 'holdout') {
    const reviewIndex = prepareEvaluationReviews({ attempts: store, reviews: new BlindReviewStore(join(directory, 'reviews')),
      suiteId: suite.id, profileDigest: summary.profileDigest, references })
    writeFileSync(join(invocation, 'review-index.json'), JSON.stringify(reviewIndex, null, 2), { flag: 'wx' })
  }
  // A successful harness does not imply quality acceptance; failures remain in summary.results.
  expect(summary.results.length).toBeLessThanOrEqual(summary.expected)
}, deadline + 60000)
