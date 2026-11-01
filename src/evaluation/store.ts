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

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { AtomicStore } from '../runtime/atomic-store'
import { contextPacketSchema } from '../knowledge/context'
import type { ModelProvider } from '../ai/types'
import { evaluationSuiteSchema } from './schema'
import { advanceEvaluationAttempt, createEvaluationAttempt, evaluationAttemptResult, evaluationAttemptSchema, type EvaluationAttempt } from './execution'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
const bodySchema = z.strictObject({
  id: z.uuid(), revision: z.number().int().nonnegative(),
  suite: evaluationSuiteSchema, packet: contextPacketSchema, attempt: evaluationAttemptSchema,
})
const recordSchema = bodySchema.extend({ digest: z.string().regex(/^[a-f0-9]{64}$/) })
type Record = z.infer<typeof recordSchema>

function key(attempt: EvaluationAttempt) {
  const hex = hash([attempt.suiteDigest, attempt.profileDigest, attempt.caseId, attempt.state.settings.seed])
  // Stable UUID-shaped storage key; state.id remains the immutable run identity.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** Native single-writer service. One instance in the owning runtime process. */
export class EvaluationStore {
  private readonly disk: AtomicStore<Record>
  private readonly busy = new Set<string>()
  constructor(directory: string) {
    this.disk = new AtomicStore(directory, recordSchema, { maxRecordBytes: 8 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024, maxRecords: 5000 })
  }
  read(id: string): Record {
    const record = this.disk.read(id), { digest, ...body } = record
    if (record.id !== id || key(record.attempt) !== id || hash(body) !== digest) throw new Error('Запись испытания повреждена. Она не будет заменена новым результатом.')
    if (hash(record.suite) !== record.attempt.suiteDigest || record.suite.id !== record.attempt.suiteId || hash(record.packet) !== record.attempt.state.contextDigest) throw new Error('Источники или набор испытания изменились.')
    for (const version of record.attempt.state.versions) if (createHash('sha256').update(version.text, 'utf8').digest('hex') !== version.digest) throw new Error('Текст результата испытания повреждён.')
    return record
  }
  list() { return this.disk.ids().map(id => this.read(id)) }
  async create(options: Parameters<typeof createEvaluationAttempt>[0]) {
    const attempt = await createEvaluationAttempt(options)
    const id = key(attempt)
    const body = bodySchema.parse({ id, revision: 0, suite: options.suite, packet: options.packet, attempt })
    // No await between existence check and create in the single writer.
    if (this.disk.ids().includes(id)) { this.read(id); throw new Error('Эта задача с выбранными настройками и seed уже запускалась. Повтор не заменяет её результат.') }
    this.disk.write(id, { ...body, digest: hash(body) }, 'create')
    return this.read(id)
  }
  async advance(id: string, provider: ModelProvider, signal: AbortSignal, beforeModel?: () => void) {
    if (this.busy.has(id)) throw new Error('Этап этого испытания уже выполняется.')
    this.busy.add(id)
    try {
      let current = this.read(id)
      await advanceEvaluationAttempt({ attempt: current.attempt, suite: current.suite, packet: current.packet, provider, signal, beforeModel,
        save: async attempt => {
          const latest = this.read(id)
          if (latest.revision !== current.revision || latest.digest !== current.digest) throw new Error('Контрольная точка изменилась во время этапа.')
          const { digest: _digest, ...previous } = latest
          void _digest
          const body = bodySchema.parse({ ...previous, attempt, revision: latest.revision + 1 })
          this.disk.write(id, { ...body, digest: hash(body) }, 'replace')
          current = this.read(id)
        },
      })
      return this.read(id)
    } finally { this.busy.delete(id) }
  }
  results() {
    return this.list().filter(record => !['planner', 'writer', 'reviewer'].includes(record.attempt.state.phase)).map(record => evaluationAttemptResult(record.attempt))
  }
}
