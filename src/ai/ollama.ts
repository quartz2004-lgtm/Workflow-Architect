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
import { assertValueBudget } from '../execution/values'
import { localConnectionSchema, localModelNameSchema, type LocalConnection } from './schema'
import type { ModelCapabilities, ModelProvider, ModelRequest, ModelResponse } from './types'
import { modelImagesSchema } from './images'

const toolCall = z.object({ function: z.object({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), arguments: z.record(z.string(), z.json()) }) })
const replySchema = z.object({
  model: z.string(), done: z.literal(true), done_reason: z.enum(['stop', 'length']),
  message: z.object({ role: z.literal('assistant'), content: z.string().max(500000), tool_calls: z.array(toolCall).max(24).optional() }),
  prompt_eval_count: z.number().int().min(0).max(1000000), eval_count: z.number().int().min(0).max(1000000),
})

/** Native-runtime adapter. Fixed numeric loopback address prevents DNS and redirect escapes. */
export class OllamaProvider implements ModelProvider {
  readonly id = 'ollama'
  readonly costPerMillionInput = 0
  readonly costPerMillionOutput = 0
  private readonly base: string
  constructor(connection: LocalConnection, private readonly transport: typeof fetch = fetch) {
    const parsed = localConnectionSchema.parse(connection)
    this.base = `http://127.0.0.1:${parsed.port}`
  }
  private async request(path: '/api/tags' | '/api/show' | '/api/chat', body: unknown, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted()
    const serialized = body === undefined ? undefined : JSON.stringify(body)
    if (serialized && new TextEncoder().encode(serialized).byteLength > 2 * 1024 * 1024) throw new Error('Запрос модели превышает 2 MiB.')
    let response: Response
    try {
      response = await this.transport(this.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' }, body: serialized, signal, redirect: 'error', credentials: 'omit',
      })
    } catch {
      signal.throwIfAborted()
      throw new Error('Ollama недоступна. Запустите её и проверьте порт подключения.')
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Ollama вернула HTTP ${response.status}. Проверьте установленную модель и её возможности.`) }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Ollama вернула пустой ответ.')
    const chunks: Uint8Array[] = []; let size = 0
    try {
      while (true) {
        signal.throwIfAborted()
        const item = await reader.read()
        if (item.done) break
        size += item.value.byteLength
        if (size > 2 * 1024 * 1024) throw new Error('Ответ модели превышает 2 MiB.')
        chunks.push(item.value)
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error }
    finally { reader.releaseLock() }
    signal.throwIfAborted()
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let data: unknown
    try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
    catch { throw new Error('Ollama вернула некорректный JSON.') }
    assertValueBudget(data, 2 * 1024 * 1024)
    return data
  }
  async list(signal: AbortSignal): Promise<string[]> {
    const data = z.object({ models: z.array(z.object({ name: z.string() })).max(1000) }).parse(await this.request('/api/tags', undefined, signal))
    return [...new Set(data.models.map(item => item.name).filter(name => localModelNameSchema.safeParse(name).success))].sort()
  }
  async inspect(model: string, signal: AbortSignal): Promise<ModelCapabilities> {
    const data = z.object({ capabilities: z.array(z.string()).max(100), model_info: z.record(z.string(), z.unknown()), remote_host: z.string().optional(), remote_model: z.string().optional() })
      .parse(await this.request('/api/show', { model: localModelNameSchema.parse(model) }, signal))
    if (data.remote_host || data.remote_model) throw new Error('Облачная модель не разрешена локальным подключением.')
    if (!data.capabilities.includes('completion')) throw new Error('Эта модель не поддерживает генерацию текста.')
    const contexts = Object.entries(data.model_info).filter(([key, value]) => key.endsWith('.context_length') && typeof value === 'number').map(([, value]) => value as number)
    const contextTokens = contexts.length ? Math.min(...contexts) : 2048
    if (!Number.isSafeInteger(contextTokens) || contextTokens < 2048) throw new Error('Не удалось определить контекст модели.')
    return { tools: data.capabilities.includes('tools'), thinking: data.capabilities.includes('thinking'), vision: data.capabilities.includes('vision'), contextTokens: Math.min(contextTokens, 32768) }
  }
  /** Digest identifies installed weights; a mutable model tag alone is insufficient evidence. */
  async identity(model: string, signal: AbortSignal): Promise<string> {
    const name = localModelNameSchema.parse(model)
    const data = z.object({ models: z.array(z.object({ name: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/) })).max(1000) }).parse(await this.request('/api/tags', undefined, signal))
    const matches = data.models.filter(item => item.name === name || (!name.includes(':') && item.name === `${name}:latest`))
    if (matches.length !== 1) throw new Error('Не удалось однозначно определить установленную версию модели. Обновите список моделей и выберите её заново.')
    return matches[0]!.digest
  }
  async chat(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse> {
    localModelNameSchema.parse(request.model)
    const images = modelImagesSchema.parse(request.messages.flatMap(message => message.images ?? []))
    if (images.length && request.messages.some(message => message.images?.length && message.role !== 'user')) throw new Error('Изображения допустимы только в пользовательском сообщении.')
    const data = replySchema.parse(await this.request('/api/chat', {
      model: request.model, stream: false, think: false, keep_alive: '5m',
      messages: request.messages.map(message => ({ role: message.role, content: message.content,
        ...(message.images?.length ? { images: message.images.map(image => image.data) } : {}),
        ...(message.toolName ? { tool_name: message.toolName } : {}),
        ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map(call => ({ type: 'function', function: call })) } : {}),
      })),
      ...(request.tools.length ? { tools: request.tools.map(tool => ({ type: 'function', function: tool })) } : {}),
      ...(request.outputSchema ? { format: request.outputSchema } : {}),
      options: { num_predict: request.maxOutputTokens, num_ctx: request.contextTokens, temperature: request.temperature },
    }, signal))
    return { content: data.message.content, toolCalls: (data.message.tool_calls ?? []).map(call => call.function),
      inputTokens: data.prompt_eval_count, outputTokens: data.eval_count, finish: data.done_reason }
  }
}
