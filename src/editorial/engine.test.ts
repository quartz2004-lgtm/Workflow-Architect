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
import type { ModelProvider, ModelRequest, ModelResponse } from '../ai/types'
import type { ContextPacket } from '../knowledge/context'
import { advanceEditorial, createEditorialState } from './engine'
import type { EditorialSettings, EditorialState } from './engine-schema'

const id = '00000000-0000-4000-8000-000000000001'
const packet: ContextPacket = { schemaVersion: '0.5.3', profileId: id, runId: id, task: 'Тема', query: 'Тема', excerpts: [], gaps: [], budgetBytes: 4000 }
const settings: EditorialSettings = { model: 'local-model', modelDigest: 'a'.repeat(64), contextTokens: 32768, maxOutputTokens: 2048, temperature: 0.3, callTimeoutMs: 1000 }
const article = `# Выбор\n\n## Посадка\n${'Пример '.repeat(60)}\n\n## Проверка\n${'Движение '.repeat(60)}`
const ready = JSON.stringify({ verdict: 'ready-for-human', comments: [] })
const reply = (content: string, finish: 'stop' | 'length' = 'stop'): ModelResponse => ({ content, finish, toolCalls: [], inputTokens: 100, outputTokens: 100 })

function provider(responses: ModelResponse[]): ModelProvider & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = []
  return {
    id: 'ollama', costPerMillionInput: 0, costPerMillionOutput: 0, requests,
    list: async () => ['local-model'], inspect: async () => ({ tools: false, thinking: false, contextTokens: 32768 }),
    identity: async () => 'a'.repeat(64),
    async chat(request) { requests.push(structuredClone(request)); const response = responses.shift(); if (!response) throw new Error('Unexpected call'); return response },
  }
}
const start = () => createEditorialState({ text: 'Статья о посадке', minimumWords: 100 }, packet, settings)
const signal = () => new AbortController().signal

describe('durable bounded editorial stages', () => {
  it('persists exact requests before calls and separates planner, writer and reviewer', async () => {
    let state = await start()
    const model = provider([reply('План'), reply(article), reply(ready)])
    const saved: EditorialState[] = []
    const save = async (value: EditorialState) => { saved.push(structuredClone(value)) }
    for (let i = 0; i < 3; i++) state = await advanceEditorial({ state, packet, provider: model, signal: signal(), save })
    expect(state.phase).toBe('awaiting-human')
    expect(state.versions).toHaveLength(1)
    expect(state.versions[0]!.text).toBe(article)
    expect(state.calls.map(call => call.stage)).toEqual(['planner', 'writer', 'reviewer'])
    expect(saved.map(item => item.calls.at(-1)?.status)).toEqual(['pending', 'complete', 'pending', 'complete', 'pending', 'complete'])
    expect(state.calls.every(call => call.settings.modelDigest === 'a'.repeat(64) && call.metrics?.outputTokens === 100)).toBe(true)
    expect(model.requests.every(request => request.messages.length === 2 && request.tools.length === 0)).toBe(true)
    expect(state.spentTokens).toBe(600)
  })

  it('caps failed drafts at three and never accumulates failed conversation history', async () => {
    let state = await start()
    const model = provider([reply('План'), reply('черновик-A'), reply(ready), reply('черновик-B'), reply(ready), reply('черновик-C'), reply(ready)])
    const save = async () => {}
    for (let i = 0; i < 8; i++) state = await advanceEditorial({ state, packet, provider: model, signal: signal(), save })
    expect(state.phase).toBe('needs-editing')
    expect(state.versions.map(version => version.text)).toEqual(['черновик-A', 'черновик-B', 'черновик-C'])
    expect(model.requests).toHaveLength(7)
    const finalWriter = model.requests[5]!.messages[1]!.content
    expect(finalWriter).toContain('черновик-B')
    expect(finalWriter).not.toContain('черновик-A')
    expect(state.issues.some(item => item.code === 'volume')).toBe(true)
  })

  it('does not let a positive model review erase formal failures or knowledge gaps', async () => {
    const missing = { ...packet, gaps: [{ kind: 'missing-sku' as const, detail: 'Товар отсутствует' }] }
    let state = await createEditorialState({ text: 'Тема', minimumWords: 100 }, missing, settings)
    const model = provider([reply('План'), reply(article, 'length'), reply(ready)])
    for (let i = 0; i < 3; i++) state = await advanceEditorial({ state, packet: missing, provider: model, signal: signal(), save: async () => {} })
    expect(state.phase).toBe('writer')
    expect(state.versions[0]!.issues.map(item => item.code)).toEqual(['incomplete', 'knowledge-gap'])
    expect(state.versions[0]!.text).toBe(article)
  })

  it('preserves a concrete semantic objection independently from program checks', async () => {
    let state = await start()
    const model = provider([reply('План'), reply(article), reply(JSON.stringify({ verdict: 'needs-editing', comments: ['В источнике нет обещания здоровья.'] }))])
    for (let i = 0; i < 3; i++) state = await advanceEditorial({ state, packet, provider: model, signal: signal(), save: async () => {} })
    expect(state.phase).toBe('writer')
    expect(state.issues).toEqual([{ code: 'editorial', origin: 'reviewer', message: 'В источнике нет обещания здоровья.' }])
  })

  it('refuses changed sources and never reissues a call with unknown outcome', async () => {
    const state = await start(), model = provider([reply('План')])
    await expect(advanceEditorial({ state, packet: { ...packet, task: 'Changed' }, provider: model, signal: signal(), save: async () => {} })).rejects.toThrow('Досье изменилось')
    let pending: EditorialState | undefined
    await advanceEditorial({ state, packet, provider: model, signal: signal(), save: async value => { if (value.calls.at(-1)?.status === 'pending') pending = structuredClone(value) } })
    expect(pending).toBeDefined()
    const resumed = await advanceEditorial({ state: pending!, packet, provider: model, signal: signal(), save: async () => {} })
    expect(resumed.phase).toBe('interrupted')
    expect(model.requests).toHaveLength(1)
    expect(resumed.spentTokens).toBe(pending!.spentTokens)
  })

  it('does not send a request when durable intent cannot be saved', async () => {
    const state = await start(), model = provider([reply('План')])
    await expect(advanceEditorial({ state, packet, provider: model, signal: signal(), save: async () => { throw new Error('Disk full') } })).rejects.toThrow('Disk full')
    expect(model.requests).toHaveLength(0)
  })

  it('does not overwrite completed evidence when its commit fails', async () => {
    const state = await start(), model = provider([reply('План')]), saved: EditorialState[] = []
    await expect(advanceEditorial({ state, packet, provider: model, signal: signal(), save: async value => { saved.push(value); if (value.calls.at(-1)?.status === 'complete') throw new Error('Disk full') } })).rejects.toThrow('Disk full')
    expect(saved).toHaveLength(2)
    expect(saved[1]!.calls[0]!.response).toBe('План')
  })

  it('honours deadline, cancellation and context budgets without a model call', async () => {
    const state = await start(), model = provider([])
    const common = { packet, provider: model, save: async () => {} }
    expect((await advanceEditorial({ ...common, state: { ...state, deadline: Date.now() - 1 }, signal: signal() })).phase).toBe('needs-editing')
    const abort = new AbortController(); abort.abort()
    expect((await advanceEditorial({ ...common, state, signal: abort.signal })).phase).toBe('cancelled')
    expect((await advanceEditorial({ ...common, state: { ...state, settings: { ...settings, contextTokens: 2048 } }, signal: signal() })).phase).toBe('needs-editing')
    expect(model.requests).toHaveLength(0)
  })

  it('cancels a provider that ignores AbortSignal, retaining the consumed reservation', async () => {
    const state = await start(), model = provider([]), controller = new AbortController()
    model.chat = vi.fn(async () => { controller.abort(new Error('Stop')); return new Promise<ModelResponse>(() => {}) })
    const result = await advanceEditorial({ state, packet, provider: model, signal: controller.signal, save: async () => {} })
    expect(result.phase).toBe('cancelled')
    expect(result.calls[0]!.status).toBe('failed')
    expect(result.spentTokens).toBe(result.calls[0]!.reservedTokens)
  })
})
