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
import type { ModelProvider } from '../ai/types'
import { contextPacketSchema, type ContextPacket } from '../knowledge/context'
import { advanceEditorial, createEditorialState } from '../editorial/engine'
import { editorialStateSchema, type EditorialSettings } from '../editorial/engine-schema'
import { normalizeEditorialTask } from '../editorial/schema'
import { editorialDigest } from '../editorial/versions'
import type { ProcessSnapshot } from '../editorial/process-schema'
import { evaluationInput, evaluationRunSchema, evaluationSuiteDigest, evaluationSuiteSchema, type EvaluationRun, type EvaluationSuite } from './schema'

export const evaluationAttemptSchema = z.strictObject({
  schemaVersion: z.literal('0.5.5'), suiteId: z.uuid(), suiteDigest: z.string().regex(/^[a-f0-9]{64}$/),
  caseId: z.uuid(), phase: z.enum(['development', 'holdout']),
  profileDigest: z.string().regex(/^[a-f0-9]{64}$/),
  state: editorialStateSchema,
})
export type EvaluationAttempt = z.infer<typeof evaluationAttemptSchema>

function taskInput(suite: EvaluationSuite, caseId: string, phase: EvaluationAttempt['phase']) {
  const input = evaluationInput(suite, caseId, phase)
  return normalizeEditorialTask({ schemaVersion: '0.5.5', kind: input.kind, text: input.prompt, audience: 'Общая аудитория', language: 'Русский',
    ...input.contract, ...(input.previousText ? { previousArticle: input.previousText } : {}),
  })
}
async function profileDigest(state: EvaluationAttempt['state']) {
  const { seed: _seed, ...settings } = state.settings
  void _seed
  return editorialDigest(JSON.stringify({ implementation: 'editorial-0.5.5-v1', settings, process: state.process ?? null, budget: state.budget }))
}

/** No reference text is accepted here. The same engine and checks serve runtime and evaluation. */
export async function createEvaluationAttempt(options: {
  suite: EvaluationSuite; caseId: string; phase: EvaluationAttempt['phase']; seed: number
  packet: ContextPacket; settings: EditorialSettings; process?: ProcessSnapshot
}): Promise<EvaluationAttempt> {
  const suite = evaluationSuiteSchema.parse(options.suite)
  if (!suite.seeds.includes(options.seed)) throw new Error('Seed is outside the frozen experiment.')
  const input = evaluationInput(suite, options.caseId, options.phase)
  const packet = contextPacketSchema.parse(options.packet)
  if (await editorialDigest(JSON.stringify(packet)) !== input.packetDigest) throw new Error('Source packet differs from the frozen experiment.')
  const state = await createEditorialState(taskInput(suite, options.caseId, options.phase), packet, { ...options.settings, seed: options.seed }, undefined, Date.now(), options.process)
  return evaluationAttemptSchema.parse({ schemaVersion: '0.5.5', suiteId: suite.id, suiteDigest: await evaluationSuiteDigest(suite), caseId: options.caseId, phase: options.phase, profileDigest: await profileDigest(state), state })
}

/** One checkpoint at a time; pending calls are never replayed after restart. */
export async function advanceEvaluationAttempt(options: {
  attempt: EvaluationAttempt; suite: EvaluationSuite; packet: ContextPacket; provider: ModelProvider; signal: AbortSignal
  save: (attempt: EvaluationAttempt) => Promise<void>; beforeModel?: () => void
}): Promise<EvaluationAttempt> {
  const attempt = evaluationAttemptSchema.parse(structuredClone(options.attempt))
  const suite = evaluationSuiteSchema.parse(options.suite)
  if (attempt.suiteId !== suite.id || attempt.suiteDigest !== await evaluationSuiteDigest(suite)) throw new Error('Evaluation suite has changed.')
  const input = evaluationInput(suite, attempt.caseId, attempt.phase)
  if (attempt.state.contextDigest !== input.packetDigest || JSON.stringify(attempt.state.task) !== JSON.stringify(taskInput(suite, attempt.caseId, attempt.phase))) throw new Error('Evaluation task has changed.')
  if (!suite.seeds.includes(attempt.state.settings.seed!) || attempt.profileDigest !== await profileDigest(attempt.state)) throw new Error('Evaluation settings have changed.')
  attempt.state = await advanceEditorial({ state: attempt.state, packet: options.packet, provider: options.provider, signal: options.signal, beforeModel: options.beforeModel,
    save: async state => { await options.save(evaluationAttemptSchema.parse({ ...attempt, state })) },
  })
  return attempt
}

/** This is technical evidence only. Human factual and blind ratings remain separate. */
export function evaluationAttemptResult(raw: EvaluationAttempt): EvaluationRun {
  const attempt = evaluationAttemptSchema.parse(raw), state = attempt.state
  if (['planner', 'writer', 'reviewer'].includes(state.phase)) throw new Error('Attempt is still running.')
  const last = state.versions.at(-1)
  return evaluationRunSchema.parse({ id: state.id, suiteId: attempt.suiteId, suiteDigest: attempt.suiteDigest, caseId: attempt.caseId,
    profileDigest: attempt.profileDigest, packetDigest: state.contextDigest, seed: state.settings.seed,
    status: state.phase === 'awaiting-human' ? 'complete' : state.phase === 'cancelled' ? 'cancelled' : state.phase === 'interrupted' ? 'interrupted' : 'failed',
    ...(last ? { resultDigest: last.digest } : {}), formalPassed: state.phase === 'awaiting-human' && state.issues.length === 0,
  })
}
