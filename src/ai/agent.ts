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

import { z } from 'zod'
import type { JsonValue } from '../domain/execution-config'
import { compileContract } from '../execution/contracts'
import { assertValueBudget } from '../execution/values'
import { agentLimitsSchema, localModelNameSchema, type AgentLimits } from './schema'
import type { ModelMessage, ModelProvider, ModelResponse, ModelTool } from './types'

export interface AgentTool extends ModelTool { execute(args: Record<string, JsonValue>, signal: AbortSignal): Promise<JsonValue> }
export type AgentTrace =
  | { kind: 'model-start'; call: number; model: string }
  | { kind: 'model-finish'; call: number; model: string; durationMs: number; inputTokens: number; outputTokens: number; costUsd: number; finish: 'stop' | 'length' }
  | { kind: 'tool-start'; call: number; name: string; arguments: Record<string, JsonValue> }
  | { kind: 'tool-finish'; call: number; name: string; result: JsonValue }
export interface AgentRequest {
  model: string; system: string; input: JsonValue; limits: AgentLimits; temperature: number
  tools: AgentTool[]; requiredTools?: string[]; outputSchema?: Record<string, JsonValue>; minimumWords?: number
}
export interface AgentResult { output: JsonValue; inputTokens: number; outputTokens: number; costUsd: number; calls: number; toolCalls: number }
export const countWords = (text: string): number => text.match(/[\p{L}\p{N}]+(?:['’‐-][\p{L}\p{N}]+)*/gu)?.length ?? 0

/** Also races providers that ignore AbortSignal; their late reply can never execute a tool. */
async function abortable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let listener: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => {
    listener = () => reject(signal.reason ?? new Error('Запрос отменён.'))
    signal.addEventListener('abort', listener, { once: true })
  })
  try { return await Promise.race([work(), cancelled]) }
  finally { signal.removeEventListener('abort', listener) }
}

/** No ambient tools, persistent memory, filesystem or network access in the agent loop. */
export async function runAgent(provider: ModelProvider, raw: AgentRequest, signal: AbortSignal, trace: (event: AgentTrace) => void = () => {}): Promise<AgentResult> {
  const limits = agentLimitsSchema.parse(raw.limits)
  const model = localModelNameSchema.parse(raw.model)
  const system = z.string().min(1).max(24000).parse(raw.system)
  const temperature = z.number().finite().min(0).max(2).parse(raw.temperature)
  const minimumWords = z.number().int().min(0).max(5000).parse(raw.minimumWords ?? 0)
  if (raw.tools.length > 24 || new Set(raw.tools.map(tool => tool.name)).size !== raw.tools.length) throw new Error('Некорректный список инструментов.')
  const tools = raw.tools.map(tool => {
    z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).parse(tool.name)
    z.string().max(2000).parse(tool.description)
    return { definition: { name: tool.name, description: tool.description, parameters: structuredClone(tool.parameters) }, check: compileContract(tool.parameters), execute: tool.execute }
  })
  const requiredTools = z.array(z.string()).max(24).parse(raw.requiredTools ?? [])
  if (requiredTools.some(name => !tools.some(tool => tool.definition.name === name))) throw new Error('Обязательный инструмент не разрешён агенту.')
  assertValueBudget(raw.input, 128 * 1024)
  const schema = raw.outputSchema ? structuredClone(raw.outputSchema) : undefined
  const validateOutput = schema ? compileContract(schema) : undefined
  for (const price of [provider.costPerMillionInput, provider.costPerMillionOutput]) z.number().finite().min(0).parse(price)
  const timer = new AbortController()
  const timeout = setTimeout(() => timer.abort(new Error('Истёк timeout агента.')), limits.timeoutMs)
  const combined = AbortSignal.any([signal, timer.signal])
  let inputTokens = 0, outputTokens = 0, costUsd = 0, toolCalls = 0
  const usedTools = new Set<string>()
  const messages: ModelMessage[] = [{ role: 'system', content: system }, { role: 'user', content: typeof raw.input === 'string' ? raw.input : JSON.stringify(raw.input) }]
  try {
    const capabilities = await abortable(() => provider.inspect(model, combined), combined)
    if (tools.length && !capabilities.tools) throw new Error('Модель не поддерживает вызовы инструментов.')
    const contextTokens = Math.min(capabilities.contextTokens, limits.contextTokens)
    for (let call = 1; call <= limits.maxCalls; call++) {
      combined.throwIfAborted()
      // A conservative UTF-8 byte bound plus framing reserve; never silently trim user context.
      const inputBound = new TextEncoder().encode(JSON.stringify({ messages, tools: tools.map(tool => tool.definition), schema })).byteLength + 1024
      const remaining = limits.maxTotalTokens - inputTokens - outputTokens
      const maxOutputTokens = Math.min(limits.maxOutputTokens, remaining - inputBound, contextTokens - inputBound)
      if (maxOutputTokens < 64) throw new Error('Недостаточно бюджета токенов или контекста для следующего вызова. Сократите контекст или увеличьте лимит.')
      const reservedCost = (inputBound * provider.costPerMillionInput + maxOutputTokens * provider.costPerMillionOutput) / 1000000
      if (costUsd + reservedCost > limits.maxCostUsd) throw new Error('Следующий запрос превышает лимит расходов.')
      trace({ kind: 'model-start', call, model })
      const started = Date.now()
      const reply: ModelResponse = await abortable(() => provider.chat({ model, messages: structuredClone(messages), tools: tools.map(tool => tool.definition), outputSchema: schema, maxOutputTokens, contextTokens, temperature }, combined), combined)
      combined.throwIfAborted()
      // Providers are an external boundary even when supplied by an in-process adapter.
      assertValueBudget(reply)
      z.object({ content: z.string(), toolCalls: z.array(z.object({ name: z.string(), arguments: z.record(z.string(), z.json()) })).max(24), inputTokens: z.number().int().min(0), outputTokens: z.number().int().min(0), finish: z.enum(['stop', 'length']) }).parse(reply)
      inputTokens += reply.inputTokens; outputTokens += reply.outputTokens
      const callCost = (reply.inputTokens * provider.costPerMillionInput + reply.outputTokens * provider.costPerMillionOutput) / 1000000
      costUsd += callCost
      trace({ kind: 'model-finish', call, model, durationMs: Date.now() - started, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, costUsd: callCost, finish: reply.finish })
      if (inputTokens + outputTokens > limits.maxTotalTokens || reply.outputTokens > maxOutputTokens || reply.inputTokens + reply.outputTokens > contextTokens) throw new Error('Модель превысила лимит токенов.')
      if (costUsd > limits.maxCostUsd) throw new Error('Превышен лимит расходов.')
      if (reply.finish === 'length') throw new Error('Модель исчерпала лимит ответа. Частичный текст не считается завершённым результатом.')
      if (!reply.toolCalls.length) {
        if (!reply.content.trim()) throw new Error('Модель вернула пустой результат.')
        if (requiredTools.some(name => !usedTools.has(name))) throw new Error('Модель завершила ответ без обязательного инструмента.')
        let output: JsonValue = reply.content
        if (validateOutput) {
          try { output = JSON.parse(reply.content) as JsonValue } catch { throw new Error('Модель вернула не JSON при заданном structured output.') }
          assertValueBudget(output)
          const issues = validateOutput(output)
          if (issues.length) throw new Error(`Результат модели не соответствует схеме: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`)
        }
        if (minimumWords && (typeof output !== 'string' || countWords(output) < minimumWords)) throw new Error(`Результат должен содержать не менее ${minimumWords} слов.`)
        return { output, inputTokens, outputTokens, costUsd, calls: call, toolCalls }
      }
      if (call === limits.maxCalls) throw new Error('Исчерпан лимит вызовов модели; новый инструмент не запущен.')
      if (toolCalls + reply.toolCalls.length > limits.maxToolCalls) throw new Error('Превышен лимит вызовов инструментов.')
      // Validate the entire batch before executing its first tool.
      const batch = reply.toolCalls.map(request => {
        const tool = tools.find(tool => tool.definition.name === request.name)
        if (!tool) throw new Error(`Инструмент ${request.name.slice(0, 64)} не разрешён агенту.`)
        if (tool.check(request.arguments).length) throw new Error(`Некорректные аргументы инструмента ${request.name}.`)
        return { tool, request }
      })
      messages.push({ role: 'assistant', content: reply.content, toolCalls: structuredClone(reply.toolCalls) })
      for (const { tool, request } of batch) {
        combined.throwIfAborted()
        trace({ kind: 'tool-start', call, name: request.name, arguments: structuredClone(request.arguments) })
        const result = await abortable(() => tool.execute(structuredClone(request.arguments), combined), combined)
        combined.throwIfAborted(); assertValueBudget(result, 128 * 1024)
        toolCalls++; usedTools.add(request.name)
        trace({ kind: 'tool-finish', call, name: request.name, result: structuredClone(result) })
        messages.push({ role: 'tool', toolName: request.name, content: JSON.stringify(result) })
      }
    }
    throw new Error('Исчерпан лимит вызовов модели.')
  } finally { clearTimeout(timeout) }
}
