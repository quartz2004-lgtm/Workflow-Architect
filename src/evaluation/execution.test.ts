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

import { describe, expect, it, vi } from 'vitest'
import { createEvaluationAttempt, advanceEvaluationAttempt, evaluationAttemptResult, type EvaluationAttempt } from './execution'
import { evaluationKinds, evaluationSuiteSchema } from './schema'
import { editorialDigest } from '../editorial/versions'
import type { ContextPacket } from '../knowledge/context'
import type { ModelProvider, ModelRequest } from '../ai/types'
import { profileIds } from '../profiles/schema'

async function fixture() {
  const packet: ContextPacket = { schemaVersion: '0.5.3', profileId: profileIds[0], runId: crypto.randomUUID(), task: 'Тест', query: 'Тест', excerpts: [], gaps: [], budgetBytes: 16000 }
  const packetDigest = await editorialDigest(JSON.stringify(packet))
  const suite = evaluationSuiteSchema.parse({ schemaVersion: '0.5.5', id: crypto.randomUUID(), createdAt: new Date().toISOString(), seeds: [17, 53], raters: [crypto.randomUUID(), crypto.randomUUID()],
    cases: evaluationKinds.flatMap(kind => Array.from({ length: 5 }, (_, i) => ({ id: crypto.randomUUID(), kind, split: i < 3 ? 'development' : 'holdout', prompt: `${kind} задача ${i}`,
      ...(kind === 'revision' ? { previousText: 'Исходный факт.' } : {}),
      contract: { minimumWords: kind === 'article' ? 600 : kind === 'short-block' ? 100 : 0, minimumSections: kind === 'article' ? 2 : 0, ...(kind === 'short-block' ? { maximumWords: 130 } : {}) },
      packetDigest, reference: { digest: 'b'.repeat(64), packetDigest, verifiedBy: 'SYNTHETIC ONLY', verifiedAt: new Date().toISOString() },
    }))),
  })
  const settings = { model: 'test', modelDigest: 'a'.repeat(64), contextTokens: 32768, maxOutputTokens: 2048, temperature: 0.3, callTimeoutMs: 1000 }
  const options = { suite, packet, settings, caseId: suite.cases[0]!.id, phase: 'development' as const, seed: 17 }
  const requests: ModelRequest[] = [], saved: EvaluationAttempt[] = []
  const provider: ModelProvider = { id: 'ollama', costPerMillionInput: 0, costPerMillionOutput: 0, list: async () => ['test'], identity: async () => settings.modelDigest,
    inspect: async () => ({ tools: false, thinking: false, contextTokens: 32768 }),
    chat: vi.fn(async request => { requests.push(request); return { content: requests.length === 1 ? 'Замысел' : requests.length === 2 ? 'Ответ по фактам.' : '{"verdict":"ready-for-human","comments":[]}', inputTokens: 50, outputTokens: 50, toolCalls: [], finish: 'stop' as const } }),
  }
  const advance = (attempt: EvaluationAttempt) => advanceEvaluationAttempt({ attempt, suite, packet, provider, signal: new AbortController().signal, save: async value => { saved.push(structuredClone(value)) } })
  return { options, provider, requests, saved, advance }
}

describe('evaluation through the production editorial engine', () => {
  it('records pending calls and exact responses without reference data in prompts', async () => {
    const f = await fixture()
    let attempt = await createEvaluationAttempt(f.options)
    expect(() => evaluationAttemptResult(attempt)).toThrow('still running')
    for (let i = 0; i < 3; i++) attempt = await f.advance(attempt)
    const result = evaluationAttemptResult(attempt)
    expect(result).toMatchObject({ status: 'complete', formalPassed: true, seed: 17 })
    expect(result.resultDigest).toBe(await editorialDigest('Ответ по фактам.'))
    expect(f.saved.some(saved => saved.state.calls.some(call => call.status === 'pending'))).toBe(true)
    expect(f.requests.every(request => request.seed === 17)).toBe(true)
    expect(JSON.stringify(f.requests)).not.toContain('SYNTHETIC ONLY')
    expect(JSON.stringify(f.requests)).not.toContain('b'.repeat(64))
    expect(attempt.state.calls[1]!.response).toBe('Ответ по фактам.')
    expect((await createEvaluationAttempt({ ...f.options, seed: 53 })).profileDigest).toBe(attempt.profileDigest)
  })
  it('rejects changed sources, settings, task, seed and wrong phase before model calls', async () => {
    const f = await fixture(), attempt = await createEvaluationAttempt(f.options)
    await expect(createEvaluationAttempt({ ...f.options, seed: 99 })).rejects.toThrow('Seed')
    await expect(createEvaluationAttempt({ ...f.options, phase: 'holdout' })).rejects.toThrow('phase')
    await expect(createEvaluationAttempt({ ...f.options, packet: { ...f.options.packet, query: 'Изменено' } })).rejects.toThrow('packet')
    const changed = structuredClone(attempt); changed.state.settings.temperature = 1
    await expect(f.advance(changed)).rejects.toThrow('settings')
    const task = structuredClone(attempt); task.state.task.text = 'Другая задача'
    await expect(f.advance(task)).rejects.toThrow('task')
    expect(f.provider.chat).not.toHaveBeenCalled()
  })
  it('restores an unresolved call as interrupted without replay or a passing result', async () => {
    const f = await fixture()
    await f.advance(await createEvaluationAttempt(f.options))
    const pending = f.saved.find(saved => saved.state.calls.some(call => call.status === 'pending'))!
    const restored = await f.advance(pending)
    expect(evaluationAttemptResult(restored)).toMatchObject({ status: 'interrupted', formalPassed: false })
    expect(f.provider.chat).toHaveBeenCalledTimes(1)
  })
})
