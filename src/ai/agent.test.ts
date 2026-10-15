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
import { runAgent, type AgentRequest, type AgentTrace } from './agent'
import { defaultAgentLimits } from './schema'
import { createTextTool, textStatistics } from './text-tool'
import type { ModelProvider, ModelResponse } from './types'

const response = (content = 'Готовый текст'): ModelResponse => ({ content, toolCalls: [], inputTokens: 50, outputTokens: 30, finish: 'stop' })
function fake(replies: ModelResponse[]) {
  return { id: 'test', costPerMillionInput: 0, costPerMillionOutput: 0,
    list: vi.fn(async () => ['local']), inspect: vi.fn(async () => ({ tools: true, thinking: false, contextTokens: 32768 })),
    chat: vi.fn(async () => { const reply = replies.shift(); if (!reply) throw new Error('Unexpected call'); return reply }),
  } satisfies ModelProvider
}
const request = (changes: Partial<AgentRequest> = {}): AgentRequest => ({ model: 'qwen3:8b', system: 'Редактор', input: 'Текст для проверки.', temperature: 0.3, limits: { ...defaultAgentLimits }, tools: [], ...changes })
const call = (name = 'text_stats', args = {}): ModelResponse => ({ ...response(''), toolCalls: [{ name, arguments: args }] })

describe('bounded agent loop', () => {
  it('clarifies one empty response within budget, without retrying after tool effects', async () => {
    await expect(runAgent(fake([response(''), response()]), request(), new AbortController().signal)).resolves.toMatchObject({ calls: 2, inputTokens: 100, outputTokens: 60 })
    const empty = fake([response(''), response('')])
    await expect(runAgent(empty, request(), new AbortController().signal)).rejects.toThrow('пустой')
    expect(empty.chat).toHaveBeenCalledTimes(2)
    const tool = createTextTool('text_stats', 'Текст', 0); tool.execute = vi.fn(tool.execute)
    const afterEffect = fake([call(), response('')])
    await expect(runAgent(afterEffect, request({ tools: [tool] }), new AbortController().signal)).rejects.toThrow('пустой')
    expect(tool.execute).toHaveBeenCalledTimes(1)
    expect(afterEffect.chat).toHaveBeenCalledTimes(2)
    await expect(runAgent(fake([response('')]), request({ limits: { ...defaultAgentLimits, maxCalls: 1 } }), new AbortController().signal)).rejects.toThrow('пустой')
  })
  it('allows required tool calls before constraining the final response to JSON', async () => {
    const provider = fake([call(), response('Three words'), response('{"words":3}')])
    const outputSchema = { type: 'object', properties: { words: { type: 'number' } }, required: ['words'], additionalProperties: false }
    await expect(runAgent(provider, request({ tools: [createTextTool('text_stats', 'Три простых слова', 3)], requiredTools: ['text_stats'], outputSchema }), new AbortController().signal)).resolves.toMatchObject({ output: { words: 3 }, toolCalls: 1 })
    const calls = provider.chat.mock.calls as unknown as [import('./types').ModelRequest, AbortSignal][]
    expect(calls[0]![0].outputSchema).toBeUndefined()
    expect(calls[0]![0].messages[0]!.content).toContain('text_stats')
    expect(calls[1]![0].outputSchema).toBeUndefined()
    expect(calls[2]![0].outputSchema).toEqual(outputSchema)
    expect(calls[2]![0].tools).toEqual([])
  })
  it('executes only a granted tool, passes its result back and reports actual usage', async () => {
    const provider = fake([call(), response()]); const events: AgentTrace[] = []
    const result = await runAgent(provider, request({ tools: [createTextTool('text_stats', 'Три простых слова', 3)], requiredTools: ['text_stats'] }), new AbortController().signal, event => events.push(event))
    expect(result).toMatchObject({ output: 'Готовый текст', inputTokens: 100, outputTokens: 60, calls: 2, toolCalls: 1, costUsd: 0 })
    const second = (provider.chat.mock.calls as unknown as [import('./types').ModelRequest, AbortSignal][])[1]![0]
    expect(second.messages.at(-1)).toMatchObject({ role: 'tool', toolName: 'text_stats' })
    expect(JSON.parse(second.messages.at(-1)!.content)).toMatchObject({ words: 3, meetsMinimum: true })
    expect(events.map(event => event.kind)).toEqual(['model-start', 'model-finish', 'tool-start', 'tool-finish', 'model-start', 'model-finish'])
  })
  it('rejects an entire invalid batch before any side effect', async () => {
    const tool = createTextTool('text_stats', 'Текст', 0); tool.execute = vi.fn(tool.execute)
    const provider = fake([{ ...call(), toolCalls: [...call().toolCalls, ...call('shell').toolCalls] }])
    await expect(runAgent(provider, request({ tools: [tool] }), new AbortController().signal)).rejects.toThrow('не разрешён')
    expect(tool.execute).not.toHaveBeenCalled()
    await expect(runAgent(fake([call('text_stats', { command: 'bad' })]), request({ tools: [tool] }), new AbortController().signal)).rejects.toThrow('аргументы')
    expect(tool.execute).not.toHaveBeenCalled()
  })
  it('enforces calls and tool limits before starting tools', async () => {
    const tool = createTextTool('text_stats', 'Текст', 0); tool.execute = vi.fn(tool.execute)
    await expect(runAgent(fake([call()]), request({ tools: [tool], limits: { ...defaultAgentLimits, maxCalls: 1 } }), new AbortController().signal)).rejects.toThrow('лимит вызовов модели')
    await expect(runAgent(fake([call()]), request({ tools: [tool], limits: { ...defaultAgentLimits, maxToolCalls: 0 } }), new AbortController().signal)).rejects.toThrow('лимит вызовов инструментов')
    expect(tool.execute).not.toHaveBeenCalled()
  })
  it('does not accept partial output, missing mandatory tool, short text or invalid JSON output', async () => {
    const signal = new AbortController().signal
    await expect(runAgent(fake([{ ...response(), finish: 'length' }]), request(), signal)).rejects.toThrow('Частичный')
    await expect(runAgent(fake([response(), response()]), request({ tools: [createTextTool('text_stats', '', 0)], requiredTools: ['text_stats'] }), signal)).rejects.toThrow('обязательного')
    await expect(runAgent(fake([response(), response()]), request({ minimumWords: 600 }), signal)).rejects.toThrow('600')
    const outputSchema = { type: 'object', properties: { answer: { type: 'number' } }, required: ['answer'], additionalProperties: false }
    await expect(runAgent(fake([response('not json')]), request({ outputSchema }), signal)).rejects.toThrow('не JSON')
    await expect(runAgent(fake([response('{"answer":"wrong"}')]), request({ outputSchema }), signal)).rejects.toThrow('схеме')
    await expect(runAgent(fake([response('{"answer":42}')]), request({ outputSchema }), signal)).resolves.toMatchObject({ output: { answer: 42 } })
  })
  it('keeps optional tools available before the structured final phase', async () => {
    const provider = fake([call(), response('3'), response('{"words":3}')])
    await expect(runAgent(provider, request({ tools: [createTextTool('text_stats', 'Три простых слова', 0)], outputSchema: { type: 'object' } }), new AbortController().signal)).resolves.toMatchObject({ toolCalls: 1, calls: 3, output: { words: 3 } })
    const calls = provider.chat.mock.calls as unknown as [import('./types').ModelRequest, AbortSignal][]
    expect(calls[0]![0].tools).toHaveLength(1)
    expect(calls[2]![0].tools).toHaveLength(0)
  })
  it('corrects short text once without resetting usage or bypassing call limits', async () => {
    const provider = fake([response('Мало'), response('Достаточно полных слов')])
    await expect(runAgent(provider, request({ minimumWords: 3 }), new AbortController().signal)).resolves.toMatchObject({ calls: 2, inputTokens: 100, outputTokens: 60 })
    const limited = fake([response('Мало')])
    await expect(runAgent(limited, request({ minimumWords: 3, limits: { ...defaultAgentLimits, maxCalls: 1 } }), new AbortController().signal)).rejects.toThrow('не менее 3')
    expect(limited.chat).toHaveBeenCalledTimes(1)
  })
  it('lets the model correct a missing tool once and still executes only its explicit call', async () => {
    const tool = createTextTool('text_stats', 'Текст', 0); tool.execute = vi.fn(tool.execute)
    await expect(runAgent(fake([response(), call(), response()]), request({ tools: [tool], requiredTools: ['text_stats'] }), new AbortController().signal)).resolves.toMatchObject({ calls: 3, toolCalls: 1 })
    expect(tool.execute).toHaveBeenCalledTimes(1)
  })
  it('refuses context and cost overrun before generation and reports actual overrun before tools', async () => {
    const signal = new AbortController().signal
    const provider = fake([])
    await expect(runAgent(provider, request({ input: 'я'.repeat(17000) }), signal)).rejects.toThrow('контекста')
    expect(provider.chat).not.toHaveBeenCalled()
    provider.costPerMillionInput = 1
    await expect(runAgent(provider, request(), signal)).rejects.toThrow('расходов')
    expect(provider.chat).not.toHaveBeenCalled()
    await expect(runAgent(fake([{ ...response(), outputTokens: 9000 }]), request(), signal)).rejects.toThrow('лимит токенов')
  })
  it('cancels a non-cooperative provider and never executes its late tool call', async () => {
    const provider = fake([]), controller = new AbortController()
    let finish!: (value: ModelResponse) => void
    provider.chat = vi.fn(() => new Promise<ModelResponse>(resolve => { finish = resolve }))
    const tool = createTextTool('text_stats', '', 0); tool.execute = vi.fn(tool.execute)
    const pending = runAgent(provider, request({ tools: [tool] }), controller.signal)
    const rejected = expect(pending).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(provider.chat).toHaveBeenCalled())
    controller.abort(new Error('cancelled')); await rejected
    finish(call()); await Promise.resolve()
    expect(tool.execute).not.toHaveBeenCalled()
  })
  it('includes capability discovery in the timeout', async () => {
    vi.useFakeTimers()
    try {
      const provider = fake([]); provider.inspect = vi.fn(() => new Promise(() => {}))
      const pending = runAgent(provider, request({ limits: { ...defaultAgentLimits, timeoutMs: 1000 } }), new AbortController().signal)
      const rejected = expect(pending).rejects.toThrow('timeout')
      await vi.advanceTimersByTimeAsync(1001); await rejected
      expect(provider.chat).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
  it('checks Cyrillic words and hyphenated words without claiming factual verification', () => {
    expect(textStatistics('# Комфорт каждый день\n\nХлопок, шёлк и что-то ещё.', 8)).toEqual({ words: 8, characters: 49, paragraphs: 2, headings: 1, minimumWords: 8, meetsMinimum: true })
  })
})
