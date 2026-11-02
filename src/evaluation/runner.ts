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

import type { ModelProvider } from '../ai/types'
import type { ContextPacket } from '../knowledge/context'
import type { EditorialSettings } from '../editorial/engine-schema'
import type { ProcessSnapshot } from '../editorial/process-schema'
import { createEvaluationAttempt, evaluationAttemptResult } from './execution'
import { evaluationSuiteSchema, type EvaluationSuite } from './schema'
import { EvaluationStore } from './store'
import { assertReadableEvaluationInstructions } from './instruction-integrity'

const active = new WeakSet<EvaluationStore>()
const running = (phase: string) => ['planner', 'writer', 'reviewer'].includes(phase)
type StoredAttempt = ReturnType<EvaluationStore['read']>

/** Sequential native owner: no second engine, retries, or automatic holdout selection. */
export async function runEvaluationSeries(options: {
  store: EvaluationStore; suite: EvaluationSuite; phase: 'development' | 'holdout'
  packets: ReadonlyMap<string, ContextPacket>; settings: EditorialSettings; process?: ProcessSnapshot
  provider: ModelProvider; signal: AbortSignal
  onCheckpoint?: (record: StoredAttempt) => Promise<void>
}) {
  if (active.has(options.store)) throw new Error('Серия испытаний уже выполняется.')
  active.add(options.store)
  try {
    assertReadableEvaluationInstructions(options.process)
    const suite = evaluationSuiteSchema.parse(options.suite)
    const tasks = suite.cases.filter(task => task.split === options.phase)
    // Validate every selected packet before starting a costly model request.
    let profileDigest = '', suiteDigest = ''
    for (const task of tasks) {
      const packet = options.packets.get(task.id)
      if (!packet) throw new Error(`Отсутствует пакет задания ${task.id}.`)
      const preview = await createEvaluationAttempt({ suite, caseId: task.id, phase: options.phase,
        packet, settings: options.settings, process: options.process, seed: suite.seeds[0]! })
      profileDigest = preview.profileDigest; suiteDigest = preview.suiteDigest
    }
    if (!options.signal.aborted) {
      if (!options.provider.identity) throw new Error('Провайдер не подтверждает версию модели для эксперимента.')
      if (await options.provider.identity(options.settings.model, options.signal) !== options.settings.modelDigest) {
        throw new Error('Модель отличается от зафиксированной версии эксперимента.')
      }
    }
    const completed: StoredAttempt[] = []
    const previous = new Map(options.store.list()
      .filter(record => record.attempt.suiteDigest === suiteDigest && record.attempt.profileDigest === profileDigest)
      .map(record => [`${record.attempt.caseId}:${record.attempt.state.settings.seed}`, record]))
    for (const task of tasks) for (const seed of suite.seeds) {
      const existing = previous.get(`${task.id}:${seed}`)
      if (existing && !running(existing.attempt.state.phase)) { completed.push(existing); continue }
      // Not-yet-started items remain missing, never silently counted as a success.
      if (options.signal.aborted) continue
      let record = existing ?? await options.store.create({ suite, caseId: task.id, phase: options.phase,
        packet: options.packets.get(task.id)!, settings: options.settings, process: options.process, seed })
      while (running(record.attempt.state.phase)) {
        record = await options.store.advance(record.id, options.provider, options.signal)
        await options.onCheckpoint?.(record)
      }
      completed.push(record)
    }
    return { suiteId: suite.id, suiteDigest, profileDigest, phase: options.phase,
      expected: tasks.length * suite.seeds.length, results: completed.map(record => evaluationAttemptResult(record.attempt)) }
  } finally { active.delete(options.store) }
}
