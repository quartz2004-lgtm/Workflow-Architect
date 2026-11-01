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
  const suite = evaluationSuiteSchema.parse({ schemaVersion: '0.5.5', id: crypto.randomUUID(), createdAt: new Date().toISOString(), seeds: [17, 53], raters: [crypto.randomUUID(), crypto.randomUUID()],
    cases: evaluationKinds.flatMap(kind => Array.from({ length: 5 }, (_, i) => ({ id: crypto.randomUUID(), kind, split: i < 3 ? 'development' : 'holdout', prompt: `${kind} задача ${i}`, ...(kind === 'revision' ? { previousText: 'Факт.' } : {}),
      contract: { minimumWords: kind === 'article' ? 600 : kind === 'short-block' ? 100 : 0, minimumSections: kind === 'article' ? 2 : 0, ...(kind === 'short-block' ? { maximumWords: 130 } : {}) },
      packetDigest, reference: { digest: 'b'.repeat(64), packetDigest, verifiedBy: 'Synthetic test', verifiedAt: new Date().toISOString() },
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
