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
import { join } from 'node:path'
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
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
const experimentBodySchema = z.strictObject({
  suiteId: z.uuid(), suiteDigest: digestSchema, candidates: z.array(digestSchema).min(1).max(4),
  selected: digestSchema.nullable(), lockedAt: z.iso.datetime().nullable(),
  developmentEvidence: z.array(z.strictObject({ id: z.uuid(), digest: digestSchema })).max(5000),
}).superRefine((value, ctx) => {
  if (new Set(value.candidates).size !== value.candidates.length || (value.selected !== null && !value.candidates.includes(value.selected))
    || Boolean(value.selected) !== Boolean(value.lockedAt) || (value.selected === null && value.developmentEvidence.length)) {
    ctx.addIssue({ code: 'custom', message: 'Invalid experiment selection.' })
  }
})
const experimentSchema = experimentBodySchema.safeExtend({ digest: digestSchema })
type Experiment = z.infer<typeof experimentSchema>

function key(attempt: EvaluationAttempt) {
  const hex = hash([attempt.suiteDigest, attempt.profileDigest, attempt.caseId, attempt.state.settings.seed])
  // Stable UUID-shaped storage key; state.id remains the immutable run identity.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** Native single-writer service. One instance in the owning runtime process. */
export class EvaluationStore {
  private readonly disk: AtomicStore<Record>
  private readonly busy = new Set<string>()
  private readonly experiments: AtomicStore<Experiment>
  constructor(directory: string) {
    this.disk = new AtomicStore(directory, recordSchema, { maxRecordBytes: 8 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024, maxRecords: 5000 })
    this.experiments = new AtomicStore(join(directory, 'experiments'), experimentSchema, { maxRecordBytes: 1024 * 1024, maxTotalBytes: 16 * 1024 * 1024, maxRecords: 100 })
  }
  private experiment(suiteId: string, suiteDigest: string) {
    if (!this.experiments.ids().includes(suiteId)) return null
    const record = this.experiments.read(suiteId), { digest, ...body } = record
    if (body.suiteId !== suiteId || body.suiteDigest !== suiteDigest || hash(body) !== digest) throw new Error('Замороженный эксперимент изменён или повреждён.')
    return record
  }
  private admit(attempt: EvaluationAttempt, register: boolean) {
    const current = this.experiment(attempt.suiteId, attempt.suiteDigest)
    if (attempt.phase === 'holdout') {
      if (!current?.selected || current.selected !== attempt.profileDigest) throw new Error('Контроль закрыт: сначала зафиксируйте выбранный процесс.')
      for (const item of current.developmentEvidence) if (this.read(item.id).digest !== item.digest) throw new Error('Разработочные результаты изменились после фиксации.')
      return
    }
    if (current?.selected) throw new Error('Процесс уже зафиксирован для контроля. Для новой настройки нужен новый эксперимент.')
    if (current?.candidates.includes(attempt.profileDigest)) return
    if (!register) throw new Error('Процесс не зарегистрирован в эксперименте.')
    if (current && current.candidates.length >= 4) throw new Error('Разрешены исходный процесс и не более трёх кандидатов.')
    const body = experimentBodySchema.parse({ suiteId: attempt.suiteId, suiteDigest: attempt.suiteDigest,
      candidates: [...(current?.candidates ?? []), attempt.profileDigest], selected: null, lockedAt: null, developmentEvidence: [] })
    this.experiments.write(body.suiteId, { ...body, digest: hash(body) }, current ? 'replace' : 'create')
  }
  sealForHoldout(suiteId: string, profileDigest: string) {
    const records = this.list().filter(record => record.suite.id === suiteId)
    const first = records[0]
    if (!first) throw new Error('Нет разработочных результатов.')
    const current = this.experiment(suiteId, first.attempt.suiteDigest)
    if (!current || current.selected || !current.candidates.includes(profileDigest)) throw new Error('Выбор отсутствует или уже зафиксирован.')
    const expected = first.suite.cases.filter(task => task.split === 'development').flatMap(task => first.suite.seeds.map(seed => ({ caseId: task.id, seed })))
    for (const candidate of current.candidates) for (const item of expected) {
      const record = records.find(value => value.attempt.profileDigest === candidate && value.attempt.caseId === item.caseId && value.attempt.state.settings.seed === item.seed)
      if (!record || this.busy.has(record.id) || ['planner', 'writer', 'reviewer'].includes(record.attempt.state.phase)) throw new Error('Сначала завершите всю разработочную матрицу каждого кандидата; ошибки и отмены сохраняются.')
    }
    const body = experimentBodySchema.parse({ suiteId, suiteDigest: current.suiteDigest, candidates: current.candidates, selected: profileDigest, lockedAt: new Date().toISOString(),
      developmentEvidence: records.map(record => ({ id: record.id, digest: record.digest })) })
    this.experiments.write(suiteId, { ...body, digest: hash(body) }, 'replace')
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
    this.admit(attempt, true)
    this.disk.write(id, { ...body, digest: hash(body) }, 'create')
    return this.read(id)
  }
  async advance(id: string, provider: ModelProvider, signal: AbortSignal, beforeModel?: () => void) {
    if (this.busy.has(id)) throw new Error('Этап этого испытания уже выполняется.')
    this.busy.add(id)
    try {
      let current = this.read(id)
      this.admit(current.attempt, false)
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
