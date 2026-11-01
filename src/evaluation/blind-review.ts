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

import { createHash, randomInt, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { AtomicStore } from '../runtime/atomic-store'
import { contextPacketSchema } from '../knowledge/context'
import { evaluationRatingSchema, evaluationRunSchema, evaluationSuiteSchema } from './schema'
import { blindReviewAnswerSchema, reviewCommandSchema, type ReviewCommand } from './review-protocol'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const textHash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const hash = (value: unknown) => textHash(JSON.stringify(value))
const pairSchema = z.strictObject({
  id: z.uuid(), raterId: z.uuid(), suite: evaluationSuiteSchema, run: evaluationRunSchema,
  packet: contextPacketSchema, resultText: z.string().min(1).max(100000),
  referenceText: z.string().min(1).max(100000), modelSide: z.enum(['A', 'B']),
})
const recordSchema = z.strictObject({
  pair: pairSchema, digest,
  answer: blindReviewAnswerSchema.optional(), rating: evaluationRatingSchema.optional(),
})
type Pair = z.infer<typeof pairSchema>
type Record = z.infer<typeof recordSchema>

function validatePair(pair: Pair) {
  const task = pair.suite.cases.find(item => item.id === pair.run.caseId)
  if (!task || task.split !== 'holdout' || pair.run.status !== 'complete'
    || !pair.suite.raters.includes(pair.raterId) || !pair.suite.seeds.includes(pair.run.seed)
    || pair.suite.id !== pair.run.suiteId || hash(pair.suite) !== pair.run.suiteDigest
    || hash(pair.packet) !== task.packetDigest || pair.run.packetDigest !== task.packetDigest
    || textHash(pair.resultText) !== pair.run.resultDigest || textHash(pair.referenceText) !== task.reference.digest) {
    throw new Error('Пара не соответствует завершённому контрольному испытанию и утверждённым текстам.')
  }
  return task
}

function ratingFor(pair: Pair, answer: z.infer<typeof blindReviewAnswerSchema>, submittedAt: string) {
  const compare = (side: 'A' | 'B' | 'equal') => side === 'equal' ? 'equal' : side === pair.modelSide ? 'better' : 'worse'
  const task = validatePair(pair)
  return evaluationRatingSchema.parse({
    runId: pair.run.id, raterId: pair.raterId, resultDigest: pair.run.resultDigest,
    referenceDigest: task.reference.digest, submittedAt, blind: true,
    ...answer[pair.modelSide], accuracyVsReference: compare(answer.accuracyPreference),
    overallVsReference: compare(answer.overallPreference), notes: answer.notes,
  })
}

/** Native single-writer storage. Origin mapping and exported ratings never enter the review view. */
export class BlindReviewStore {
  private readonly disk: AtomicStore<Record>
  constructor(directory: string) {
    this.disk = new AtomicStore(directory, recordSchema, { maxRecordBytes: 8 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024, maxRecords: 5000 })
  }
  private read(id: string) {
    const record = this.disk.read(id)
    if (record.pair.id !== id || hash(record.pair) !== record.digest) throw new Error('Пара текстов повреждена.')
    validatePair(record.pair)
    if (Boolean(record.answer) !== Boolean(record.rating)
      || (record.answer && record.rating && hash(ratingFor(record.pair, record.answer, record.rating.submittedAt)) !== hash(record.rating))) {
      throw new Error('Сохранённая оценка повреждена.')
    }
    return record
  }
  handle(input: ReviewCommand) {
    const command = reviewCommandSchema.parse(input)
    switch (command.action) {
      case 'list': return this.disk.ids().flatMap(id => {
        const record = this.read(id)
        if (record.pair.raterId !== command.profileId) return []
        const task = validatePair(record.pair)
        return [{ id, submitted: Boolean(record.rating), kind: task.kind, prompt: task.prompt }]
      })
      case 'open': return this.open(command.id, command.profileId)
      case 'submit': return this.submit(command.id, command.profileId, command.digest, command.answer)
    }
  }
  /** Administrative entry point; do not expose to the rating renderer. */
  create(input: Omit<Pair, 'id' | 'modelSide'>) {
    const pair = pairSchema.parse({ ...input, id: randomUUID(), modelSide: randomInt(2) === 0 ? 'A' : 'B' })
    validatePair(pair)
    for (const id of this.disk.ids()) {
      const old = this.read(id)
      if (old.pair.run.id === pair.run.id && old.pair.raterId === pair.raterId) throw new Error('Пара для этого участника уже создана.')
    }
    this.disk.write(pair.id, { pair, digest: hash(pair) }, 'create')
    return pair.id
  }
  open(id: string, raterId: string) {
    const record = this.read(id), pair = record.pair
    if (pair.raterId !== raterId) throw new Error('Эта пара предназначена другому участнику.')
    const task = validatePair(pair)
    return {
      id, digest: record.digest, submitted: Boolean(record.rating), kind: task.kind,
      prompt: task.prompt, contract: task.contract, previousText: task.previousText,
      // Only factual excerpts; packet handoff contains model identity and must stay private.
      sources: pair.packet.excerpts, gaps: pair.packet.gaps,
      A: pair.modelSide === 'A' ? pair.resultText : pair.referenceText,
      B: pair.modelSide === 'B' ? pair.resultText : pair.referenceText,
    }
  }
  submit(id: string, raterId: string, expectedDigest: string, input: unknown) {
    const record = this.read(id)
    if (record.pair.raterId !== raterId) throw new Error('Эта пара предназначена другому участнику.')
    if (record.digest !== expectedDigest) throw new Error('Тексты изменились. Откройте пару заново.')
    if (record.rating) throw new Error('Оценка уже сохранена и не может быть заменена.')
    const answer = blindReviewAnswerSchema.parse(input)
    const rating = ratingFor(record.pair, answer, new Date().toISOString())
    this.disk.write(id, { ...record, answer, rating }, 'replace')
    return { id, submitted: true as const }
  }
  /** Administrative report export, separate from the blind participant interface. */
  ratings() { return this.disk.ids().flatMap(id => { const record = this.read(id); return record.rating ? [record.rating] : [] }) }
}
