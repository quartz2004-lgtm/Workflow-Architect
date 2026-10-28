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
import { OllamaProvider } from './ollama'
import { localConnectionSchema } from './schema'
import type { ModelRequest } from './types'

const config = { provider: 'ollama' as const, port: 11434, model: 'qwen3:8b' }
const signal = () => new AbortController().signal
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const request: ModelRequest = { model: 'qwen3:8b', messages: [{ role: 'user', content: 'Привет' }], tools: [], maxOutputTokens: 100, contextTokens: 4096, temperature: 0 }
describe('Ollama boundary', () => {
  it('identifies exact installed weights and fails closed on ambiguous or missing identities', async () => {
    const digest = 'a'.repeat(64)
    const provider = new OllamaProvider(config, async () => json({ models: [{ name: 'qwen3:8b', digest }, { name: 'local:latest', digest }] }))
    expect(await provider.identity('qwen3:8b', signal())).toBe(digest)
    expect(await provider.identity('local', signal())).toBe(digest)
    await expect(provider.identity('missing', signal())).rejects.toThrow('однозначно')
    await expect(new OllamaProvider(config, async () => json({ models: [{ name: 'qwen3:8b' }] })).identity('qwen3:8b', signal())).rejects.toThrow()
    await expect(new OllamaProvider(config, async () => json({ models: [{ name: 'local', digest }, { name: 'local:latest', digest }] })).identity('local', signal())).rejects.toThrow('однозначно')
  })
  it('uses only numeric loopback, refuses redirects, maps protocol and actual usage', async () => {
    const transport = vi.fn<typeof fetch>(async () => json({ model: 'qwen3:8b', done: true, done_reason: 'stop', message: { role: 'assistant', content: 'Здравствуйте' }, prompt_eval_count: 12, eval_count: 5 }))
    const provider = new OllamaProvider(config, transport)
    await expect(provider.chat(request, signal())).resolves.toEqual({ content: 'Здравствуйте', toolCalls: [], inputTokens: 12, outputTokens: 5, finish: 'stop' })
    expect(transport.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/chat')
    expect(transport.mock.calls[0]![1]).toMatchObject({ redirect: 'error', credentials: 'omit' })
    expect(JSON.parse(transport.mock.calls[0]![1]!.body as string)).toMatchObject({ stream: false, think: false, options: { num_predict: 100, num_ctx: 4096 } })
  })
  it('filters cloud names and refuses aliases backed by a remote model', async () => {
    const provider = new OllamaProvider(config, async () => json({ models: [{ name: 'qwen3:8b' }, { name: 'large:cloud' }] }))
    expect(await provider.list(signal())).toEqual(['qwen3:8b'])
    const remote = new OllamaProvider(config, async () => json({ capabilities: ['completion', 'tools'], model_info: {}, remote_host: 'https://ollama.com', remote_model: 'large' }))
    await expect(remote.inspect('alias', signal())).rejects.toThrow('Облачная')
    for (const model of ['x:cloud', 'https://remote/model', '../model']) expect(localConnectionSchema.safeParse({ ...config, model }).success).toBe(false)
    expect(localConnectionSchema.safeParse({ ...config, endpoint: 'https://remote' }).success).toBe(false)
  })
  it('discovers bounded capabilities and rejects embedding-only models', async () => {
    const provider = new OllamaProvider(config, async () => json({ capabilities: ['completion', 'tools', 'thinking'], model_info: { 'qwen3.context_length': 40960 } }))
    expect(await provider.inspect('qwen3:8b', signal())).toEqual({ tools: true, thinking: true, vision: false, contextTokens: 32768 })
    await expect(new OllamaProvider(config, async () => json({ capabilities: ['embedding'], model_info: {} })).inspect('embed', signal())).rejects.toThrow('генерацию')
  })
  it('rejects incomplete/malformed responses and never echoes server error bodies', async () => {
    for (const value of [{ done: false }, { done: true, message: {} }]) await expect(new OllamaProvider(config, async () => json(value)).chat(request, signal())).rejects.toThrow()
    await expect(new OllamaProvider(config, async () => new Response('secret-server-details', { status: 500 })).chat(request, signal())).rejects.toThrow('HTTP 500')
    await expect(new OllamaProvider(config, async () => new Response('not JSON')).chat(request, signal())).rejects.toThrow('некорректный JSON')
  })
  it('sends actual base64 image bytes through the REST images field, without filesystem access', async () => {
    const transport = vi.fn<typeof fetch>(async () => json({ model: 'mistral-small3.2:24b', done: true, done_reason: 'stop', message: { role: 'assistant', content: 'Изображение' }, prompt_eval_count: 100, eval_count: 5 }))
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII='
    const provider = new OllamaProvider(config, transport)
    await provider.chat({ ...request, messages: [{ role: 'user', content: 'Опиши снимок', images: [{ data, width: 1, height: 1 }] }] }, signal())
    expect(JSON.parse(transport.mock.calls[0]![1]!.body as string).messages[0]).toEqual({ role: 'user', content: 'Опиши снимок', images: [data] })
    for (const invalid of ['C:/private/photo.png', 'https://example.com/photo.png', `data:image/png;base64,${data}`]) {
      await expect(provider.chat({ ...request, messages: [{ role: 'user', content: 'Опиши', images: [{ data: invalid, width: 1, height: 1 }] }] }, signal())).rejects.toThrow()
    }
    expect(transport).toHaveBeenCalledTimes(1)
    expect((await new OllamaProvider(config, async () => json({ capabilities: ['completion', 'vision'], model_info: {} })).inspect('mistral-small3.2:24b', signal())).vision).toBe(true)
  })
  it('cancels oversized streams before buffering them entirely', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)) }, cancel })
    await expect(new OllamaProvider(config, async () => new Response(stream)).chat(request, signal())).rejects.toThrow('2 MiB')
    expect(cancel).toHaveBeenCalledOnce()
  })
})
