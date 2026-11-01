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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { EvaluationStore } from './store'
import { runEvaluationSeries } from './runner'
import { prepareEvaluationReviews } from './prepare-reviews'
import { BlindReviewStore } from './blind-review'
import { AtomicStore } from '../runtime/atomic-store'
import { evaluationKinds, evaluationSuiteSchema } from './schema'
import { editorialDigest } from '../editorial/versions'
import { profileIds } from '../profiles/schema'
import type { ContextPacket } from '../knowledge/context'
import type { ModelProvider } from '../ai/types'

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    const local = relative(tmpdir(), root)
    if (!local.startsWith('wa-evaluation-') || local.includes('..') || /[/\\]/.test(local)) throw new Error('Unsafe cleanup')
    rmSync(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wa-evaluation-')); roots.push(root)
  const packet: ContextPacket = { schemaVersion: '0.5.3', profileId: profileIds[0], runId: crypto.randomUUID(), task: 'Тест', query: 'Тест', excerpts: [], gaps: [], budgetBytes: 16000 }
  const packetDigest = await editorialDigest(JSON.stringify(packet))
  const referenceDigest = await editorialDigest('Synthetic reference')
  const suite = evaluationSuiteSchema.parse({ schemaVersion: '0.5.5', id: crypto.randomUUID(), createdAt: new Date().toISOString(), seeds: [17, 53], raters: [crypto.randomUUID(), crypto.randomUUID()],
    cases: evaluationKinds.flatMap(kind => Array.from({ length: 5 }, (_, i) => ({ id: crypto.randomUUID(), kind, split: i < 3 ? 'development' : 'holdout', prompt: `${kind} задача ${i}`, ...(kind === 'revision' ? { previousText: 'Факт.' } : {}),
      contract: { minimumWords: kind === 'article' ? 600 : kind === 'short-block' ? 100 : 0, minimumSections: kind === 'article' ? 2 : 0, ...(kind === 'short-block' ? { maximumWords: 130 } : {}) },
      packetDigest, reference: { digest: referenceDigest, packetDigest, verifiedBy: 'Synthetic test', verifiedAt: new Date().toISOString() },
    }))),
  })
  const options = { suite, packet, caseId: suite.cases[0]!.id, phase: 'development' as const, seed: 17, settings: { model: 'fixture', modelDigest: 'a'.repeat(64), contextTokens: 32768, maxOutputTokens: 2048, temperature: 0.3, callTimeoutMs: 1000 } }
  let count = 0
  const provider: ModelProvider = { id: 'ollama', costPerMillionInput: 0, costPerMillionOutput: 0, list: async () => ['fixture'], identity: async () => 'a'.repeat(64), inspect: async () => ({ contextTokens: 32768, tools: false, thinking: false }),
    chat: vi.fn(async () => ({ content: ++count === 3 ? '{"verdict":"ready-for-human","comments":[]}' : 'Тестовый текст.', finish: 'stop' as const, toolCalls: [], inputTokens: 10, outputTokens: 10 })),
  }
  return { root, options, provider, service: new EvaluationStore(root), signal: new AbortController().signal }
}
describe('durable evaluation evidence', () => {
  it('runs the whole development matrix and preserves failed attempts on resume', async () => {
    const f = await fixture()
    vi.mocked(f.provider.chat).mockRejectedValue(new Error('Synthetic provider failure'))
    const options = { store: f.service, suite: f.options.suite, phase: 'development' as const,
      packets: new Map(f.options.suite.cases.map(task => [task.id, f.options.packet])),
      settings: f.options.settings, provider: f.provider, signal: f.signal }
    const first = await runEvaluationSeries(options)
    expect(first.expected).toBe(36)
    expect(first.results).toHaveLength(36)
    expect(first.results.every(result => result.status === 'failed' && !result.formalPassed)).toBe(true)
    expect(f.provider.chat).toHaveBeenCalledTimes(36)
    const restored = await runEvaluationSeries({ ...options, store: new EvaluationStore(f.root) })
    expect(restored).toEqual(first)
    expect(f.provider.chat).toHaveBeenCalledTimes(36)
  })
  it('preflights every source and keeps cancellation gaps in the expected matrix', async () => {
    const f = await fixture(), controller = new AbortController()
    const packets = new Map(f.options.suite.cases.map(task => [task.id, f.options.packet]))
    const options = { store: f.service, suite: f.options.suite, phase: 'development' as const,
      packets, settings: f.options.settings, provider: f.provider, signal: controller.signal }
    const last = f.options.suite.cases.filter(task => task.split === 'development').at(-1)!
    packets.delete(last.id)
    await expect(runEvaluationSeries(options)).rejects.toThrow('Отсутствует пакет')
    expect(f.service.list()).toHaveLength(0)
    expect(f.provider.chat).not.toHaveBeenCalled()
    packets.set(last.id, f.options.packet)
    vi.mocked(f.provider.chat).mockImplementation(async () => { controller.abort(); throw new Error('Stopped') })
    const stopped = await runEvaluationSeries(options)
    expect(stopped.expected).toBe(36)
    expect(stopped.results).toHaveLength(1)
    expect(stopped.results[0]).toMatchObject({ status: 'cancelled', formalPassed: false })
    expect(f.provider.chat).toHaveBeenCalledTimes(1)
    vi.mocked(f.provider.chat).mockRejectedValue(new Error('Synthetic failure'))
    const resumed = await runEvaluationSeries({ ...options, signal: new AbortController().signal })
    expect(resumed.results).toHaveLength(36)
    expect(resumed.results[0]).toEqual(stopped.results[0])
    expect(f.provider.chat).toHaveBeenCalledTimes(36)
  })
  it('rejects model drift before recording or generating an attempt', async () => {
    const f = await fixture()
    f.provider.identity = async () => 'f'.repeat(64)
    await expect(runEvaluationSeries({ store: f.service, suite: f.options.suite, phase: 'development',
      packets: new Map(f.options.suite.cases.map(task => [task.id, f.options.packet])),
      settings: f.options.settings, provider: f.provider, signal: f.signal })).rejects.toThrow('Модель отличается')
    expect(f.service.list()).toHaveLength(0)
    expect(f.provider.chat).not.toHaveBeenCalled()
  })
  it('locks control until all development attempts finish and never reopens tuning after selection', async () => {
    const f = await fixture(), holdout = f.options.suite.cases.find(task => task.split === 'holdout')!
    await expect(f.service.create({ ...f.options, caseId: holdout.id, phase: 'holdout' })).rejects.toThrow('Контроль закрыт')
    const first = await f.service.create(f.options)
    expect(() => f.service.sealForHoldout(f.options.suite.id, first.attempt.profileDigest)).toThrow('матрицу')
    const aborted = AbortSignal.abort()
    for (const task of f.options.suite.cases.filter(item => item.split === 'development')) for (const seed of f.options.suite.seeds) {
      const record = task.id === f.options.caseId && seed === 17 ? first : await f.service.create({ ...f.options, caseId: task.id, seed })
      await f.service.advance(record.id, f.provider, aborted)
    }
    expect(f.provider.chat).not.toHaveBeenCalled()
    f.service.sealForHoldout(f.options.suite.id, first.attempt.profileDigest)
    const restored = new EvaluationStore(f.root)
    expect(() => restored.sealForHoldout(f.options.suite.id, first.attempt.profileDigest)).toThrow('зафиксирован')
    await expect(restored.advance(first.id, f.provider, f.signal)).rejects.toThrow('новый эксперимент')
    const control = await restored.create({ ...f.options, caseId: holdout.id, phase: 'holdout' })
    expect(control.attempt.profileDigest).toBe(first.attempt.profileDigest)
    const reviewOptions = { attempts: restored, reviews: new BlindReviewStore(join(f.root, 'reviews')),
      suiteId: f.options.suite.id, profileDigest: first.attempt.profileDigest, references: new Map<string, string>() }
    expect(prepareEvaluationReviews(reviewOptions)).toMatchObject({ expectedAttempts: 24, missingAttempts: 23,
      unfinished: 1, failed: 0, expectedPairs: 48, pairs: [] })
    await restored.advance(control.id, f.provider, aborted)
    expect(prepareEvaluationReviews(reviewOptions)).toMatchObject({ missingAttempts: 23, unfinished: 0, failed: 1, pairs: [] })
    await expect(restored.create({ ...f.options, caseId: holdout.id, phase: 'holdout', settings: { ...f.options.settings, temperature: 0.4 } })).rejects.toThrow('Контроль закрыт')
    expect(restored.results().every(result => result.status === 'cancelled' && !result.formalPassed)).toBe(true)
    const second = await restored.create({ ...f.options, caseId: holdout.id, phase: 'holdout', seed: 53 })
    for (let i = 0; i < 3; i++) await restored.advance(second.id, f.provider, f.signal)
    reviewOptions.references.set(holdout.id, 'Synthetic reference')
    const prepared = prepareEvaluationReviews(reviewOptions)
    expect(prepared).toMatchObject({ missingAttempts: 22, unfinished: 0, failed: 1, expectedPairs: 48 })
    expect(prepared.pairs).toHaveLength(2)
    expect(prepareEvaluationReviews(reviewOptions)).toEqual(prepared)
    expect(reviewOptions.reviews.ratings()).toEqual([])
  })
  it('caps process candidates and rejects a different suite behind an existing identity', async () => {
    const f = await fixture()
    for (const temperature of [0.1, 0.2, 0.3, 0.4]) await f.service.create({ ...f.options, settings: { ...f.options.settings, temperature } })
    await expect(f.service.create({ ...f.options, settings: { ...f.options.settings, temperature: 0.5 } })).rejects.toThrow('трёх кандидатов')
    const suite = structuredClone(f.options.suite); suite.cases[0]!.prompt += ' changed'
    await expect(f.service.create({ ...f.options, suite })).rejects.toThrow('эксперимент изменён')
  })
  it('restores each stage and rejects duplicate attempts before and after completion', async () => {
    const f = await fixture(), record = await f.service.create(f.options)
    const duplicates = await Promise.allSettled([f.service.create(f.options), f.service.create(f.options)])
    expect(duplicates.every(value => value.status === 'rejected')).toBe(true)
    for (let i = 0; i < 3; i++) await new EvaluationStore(f.root).advance(record.id, f.provider, f.signal)
    const restored = new EvaluationStore(f.root)
    expect(restored.results()).toEqual([expect.objectContaining({ id: record.attempt.state.id, status: 'complete', formalPassed: true })])
    expect(restored.read(record.id).attempt.state.calls).toHaveLength(3)
    await expect(restored.create(f.options)).rejects.toThrow('уже запускалась')
    expect((await restored.create({ ...f.options, seed: 53 })).id).not.toBe(record.id)
    expect(restored.list()).toHaveLength(2)
  })
  it('retains a failed attempt and detects modified evidence rather than starting again', async () => {
    const f = await fixture(), record = await f.service.create(f.options)
    vi.mocked(f.provider.chat).mockRejectedValue(new Error('Fixture unavailable'))
    await f.service.advance(record.id, f.provider, f.signal)
    expect(f.service.results()[0]).toMatchObject({ status: 'failed', formalPassed: false })
    await expect(f.service.create(f.options)).rejects.toThrow('уже запускалась')
    const path = join(f.root, `${record.id}.json`), stored = JSON.parse(readFileSync(path, 'utf8'))
    stored.attempt.state.plan = 'Tampered'
    writeFileSync(path, JSON.stringify(stored))
    expect(() => new EvaluationStore(f.root).list()).toThrow('повреждена')
    await expect(f.service.create(f.options)).rejects.toThrow('повреждена')
    expect(f.provider.chat).toHaveBeenCalledTimes(1)
  })
  it('writes pending before dispatch and never replays a crash checkpoint', async () => {
    const f = await fixture(), record = await f.service.create(f.options), path = join(f.root, `${record.id}.json`)
    let pending = ''
    vi.mocked(f.provider.chat).mockImplementationOnce(async () => {
      pending = readFileSync(path, 'utf8')
      expect(JSON.parse(pending).attempt.state.calls[0].status).toBe('pending')
      await expect(f.service.advance(record.id, f.provider, f.signal)).rejects.toThrow('уже выполняется')
      return { content: 'План', finish: 'stop', toolCalls: [], inputTokens: 10, outputTokens: 10 }
    })
    await f.service.advance(record.id, f.provider, f.signal)
    // Restore exact bytes captured at the crash boundary, before a reply was persisted.
    writeFileSync(path, pending)
    const restored = new EvaluationStore(f.root)
    await restored.advance(record.id, f.provider, f.signal)
    expect(restored.results()[0]).toMatchObject({ status: 'interrupted', formalPassed: false })
    expect(f.provider.chat).toHaveBeenCalledTimes(1)
  })
  it('does not call the model when the pre-dispatch checkpoint cannot be saved', async () => {
    const f = await fixture(), record = await f.service.create(f.options)
    vi.spyOn(AtomicStore.prototype, 'write').mockImplementation(() => { throw new Error('Disk full') })
    await expect(f.service.advance(record.id, f.provider, f.signal)).rejects.toThrow('Disk full')
    expect(f.provider.chat).not.toHaveBeenCalled()
    expect(f.service.read(record.id).revision).toBe(0)
  })
  it('keeps cancellation as a terminal attempt and does not resume it on another advance', async () => {
    const f = await fixture(), record = await f.service.create(f.options)
    await f.service.advance(record.id, f.provider, AbortSignal.abort())
    const restored = new EvaluationStore(f.root)
    expect(restored.results()[0]).toMatchObject({ status: 'cancelled', formalPassed: false })
    await restored.advance(record.id, f.provider, f.signal)
    await expect(restored.create(f.options)).rejects.toThrow('уже запускалась')
    expect(f.provider.chat).not.toHaveBeenCalled()
  })
})
