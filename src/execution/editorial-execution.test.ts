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

import { describe, expect, it } from 'vitest'
import { createEditorialExample } from './editorial-example'
import { defaultAgentKnowledge } from '../domain/knowledge-config'
import { compileProject } from './compiler'
import { ExecutionRun } from './executor'
import type { ModelProvider } from '../ai/types'
import type { RunEvent } from './run-types'
import type { RunCheckpoint } from './checkpoint'
import type { ContextPacket } from '../knowledge/context'

const id = '00000000-0000-4000-8000-000000000001'
const article = `# Статья\n\n## Посадка\n${'Пример '.repeat(310)}\n\n## Движение\n${'Проверка '.repeat(310)}`
const packet: ContextPacket = { schemaVersion: '0.5.3', profileId: id, runId: id, task: 'Статья', query: 'Статья', excerpts: [], gaps: [], budgetBytes: 4000 }
const makeProject = () => createEditorialExample('test-local', { ...defaultAgentKnowledge, collections: [{ collectionId: id }] })
function model(text = article) {
  const calls: string[] = []
  const provider: ModelProvider = {
    id: 'ollama', costPerMillionInput: 0, costPerMillionOutput: 0,
    list: async () => ['test-local'], identity: async () => 'a'.repeat(64),
    inspect: async () => ({ tools: false, thinking: false, contextTokens: 32768 }),
    chat: async request => {
      const system = request.messages[0]!.content
      const stage = system.includes('Подготовь краткий') ? 'planner' : system.includes('Напиши полный') ? 'writer' : 'reviewer'
      calls.push(stage)
      return { content: stage === 'planner' ? 'План полезной статьи' : stage === 'writer' ? text : '{"verdict":"ready-for-human","comments":[]}', finish: 'stop' as const, toolCalls: [], inputTokens: 100, outputTokens: 300 }
    },
  }
  return { provider, calls }
}
function plan(telegram = false) {
  const project = makeProject(), entry = project.nodes.find(node => node.operation?.kind === (telegram ? 'telegram-message' : 'manual'))!
  const compiled = compileProject(project, entry.id)
  if (!compiled.ok) throw new Error(compiled.diagnostics.map(item => item.message).join('\n'))
  return compiled.plan
}

describe('editorial runtime route', () => {
  it('cancels even while initial model identity ignores its AbortSignal', async () => {
    const fixture = model()
    let started!: () => void
    const identified = new Promise<void>(resolve => { started = resolve })
    fixture.provider.identity = async () => { started(); return new Promise<string>(() => {}) }
    const run = new ExecutionRun(plan(), () => {}, { runId: id, provider: () => fixture.provider, knowledge: () => packet })
    const pending = run.start('Статья')
    await identified
    run.cancel()
    expect((await pending).status).toBe('cancelled')
    expect(fixture.calls).toEqual([])
  })
  it.each([false, true])('runs one contract from Manual/Telegram (%s) and approves exact version before artifact', async telegram => {
    const compiled = plan(telegram), fixture = model(), events: RunEvent[] = []
    let checkpoint: RunCheckpoint | undefined
    const run = new ExecutionRun(compiled, event => {
      events.push(event)
      if (event.kind === 'human-request') {
        expect(event.request.editorial?.text).toBe(article)
        expect(event.request.editorial?.digest).toMatch(/^[a-f0-9]{64}$/)
        queueMicrotask(() => { expect(run.answer(event.request.id, true).ok).toBe(true) })
      }
    }, { runId: id, provider: () => fixture.provider, knowledge: () => packet, save: value => { checkpoint = structuredClone(value) } })
    const result = await run.start(telegram ? { text: 'Статья', chatId: 'do-not-write' } : 'Статья')
    expect(result.status).toBe('succeeded')
    expect(result.artifacts[0]!.content).toBe(article)
    expect(fixture.calls).toEqual(['planner', 'writer', 'reviewer'])
    expect(events.findIndex(event => event.kind === 'artifact')).toBeGreaterThan(events.findIndex(event => event.kind === 'human-answer'))
    const state = Object.values(checkpoint!.editorial!)[0]!
    expect(state.phase).toBe('awaiting-human')
    expect(state.task.text).toBe('Статья')
    expect(state.calls[0]!.prompt).not.toContain('do-not-write')
    expect(compiled.limits.timeoutMs).toBeGreaterThan(300000)
  })

  it('preserves three failed drafts and emits no Human or deliverable', async () => {
    const fixture = model('Слишком коротко'), events: RunEvent[] = []
    const run = new ExecutionRun(plan(), event => events.push(event), { runId: id, provider: () => fixture.provider, knowledge: () => packet })
    const result = await run.start('Статья')
    expect(result.status).toBe('failed')
    expect(result.error?.message).toContain('Требуется редактура')
    expect(result.artifacts).toEqual([])
    expect(events.some(event => event.kind === 'human-request')).toBe(false)
    const last = events.findLast(event => event.kind === 'editorial')!
    if (last.kind !== 'editorial') throw new Error('Missing state')
    expect(last.state.versions).toHaveLength(3)
    expect(fixture.calls).toHaveLength(7)
  })

  it('recovers a completed planner without repeating it', async () => {
    const compiled = plan(), first = model()
    let saved: RunCheckpoint | undefined
    const initial = new ExecutionRun(compiled, () => {}, { runId: id, provider: () => first.provider, knowledge: () => packet, save: value => {
      if (!saved && Object.values(value.editorial ?? {}).some(state => state.phase === 'writer' && state.calls.length === 1)) {
        saved = structuredClone(value); throw new Error('Simulated interruption')
      }
    } })
    await initial.start('Статья')
    expect(saved).toBeDefined()
    const second = model()
    const restored = new ExecutionRun(compiled, event => { if (event.kind === 'human-request') queueMicrotask(() => restored.answer(event.request.id, true)) }, { runId: id, checkpoint: saved, provider: () => second.provider, knowledge: () => packet })
    expect((await restored.start('Статья')).status).toBe('succeeded')
    expect(second.calls).toEqual(['writer', 'reviewer'])
  })

  it('rejects a path bypassing Human', () => {
    const project = makeProject(), agent = project.nodes.find(node => node.type === 'agent')!, artifact = project.nodes.find(node => node.type === 'artifact')!
    project.edges.find(edge => edge.sourceNode === agent.id)!.targetNode = artifact.id
    expect(compileProject(project, project.nodes[0]!.id).ok).toBe(false)
  })

  it('restores the same Human request and version without regenerating or approving stale requests', async () => {
    const compiled = plan(), first = model()
    let saved: RunCheckpoint | undefined
    const initial = new ExecutionRun(compiled, () => {}, { runId: id, provider: () => first.provider, knowledge: () => packet, save: value => {
      if (!saved && value.frames.some(frame => frame.human)) { saved = structuredClone(value); throw new Error('Simulated shutdown at Human') }
    } })
    await initial.start('Статья')
    const request = saved!.frames.find(frame => frame.human)!.human!.request
    expect(request.editorial?.text).toBe(article)
    const second = model(), events: RunEvent[] = []
    let answered = false
    const restored = new ExecutionRun(compiled, event => events.push(event), {
      runId: id, checkpoint: saved, provider: () => second.provider, knowledge: () => packet,
      save: value => {
        if (!answered && value.status === 'waiting') {
          answered = true
          queueMicrotask(() => {
            expect(restored.answer(crypto.randomUUID(), true).ok).toBe(false)
            expect(restored.answer(request.id, true).ok).toBe(true)
          })
        }
      },
    })
    const outcome = await restored.start('Статья')
    expect(outcome.status).toBe('succeeded')
    expect(outcome.artifacts[0]!.content).toBe(article)
    expect(second.calls).toEqual([])
    expect(events.filter(event => event.kind === 'human-request')).toHaveLength(0)
    const tampered = structuredClone(saved!)
    tampered.frames.find(frame => frame.human)!.human!.request.editorial!.text += ' changed'
    expect(() => new ExecutionRun(compiled, () => {}, { checkpoint: tampered })).toThrow('другой редакционной версии')
  })

  it('does not replay a model request whose outcome is unknown after interruption', async () => {
    const compiled = plan(), first = model()
    let saved: RunCheckpoint | undefined
    const initial = new ExecutionRun(compiled, () => {}, { runId: id, provider: () => first.provider, knowledge: () => packet, save: value => {
      if (!saved && Object.values(value.editorial ?? {}).some(state => state.calls.some(call => call.status === 'pending'))) {
        saved = structuredClone(value); throw new Error('Simulated shutdown after intent')
      }
    } })
    await initial.start('Статья')
    expect(saved).toBeDefined()
    const second = model(), events: RunEvent[] = []
    const restored = new ExecutionRun(compiled, event => events.push(event), { checkpoint: saved, provider: () => second.provider, knowledge: () => packet })
    expect((await restored.start('Статья')).status).toBe('failed')
    expect(second.calls).toEqual([])
    expect(events.some(event => event.kind === 'artifact' || event.kind === 'human-request')).toBe(false)
    const last = events.findLast(event => event.kind === 'editorial')
    expect(last?.kind === 'editorial' && last.state.phase).toBe('interrupted')
  })
})
