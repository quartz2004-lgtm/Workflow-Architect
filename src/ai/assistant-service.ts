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

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { JsonValue } from '../domain/execution-config'
import { runAgent } from './agent'
import { defaultAgentLimits } from './schema'
import { OllamaProvider } from './ollama'
import { ConnectionStore } from './connection-store'
import { aiCommandSchema, type AiCommand, type AssistantTask } from './protocol'
import { designProposalSchema, personalizationSchema, type AssistantInput } from './assistant-schema'
import type { ModelProvider } from './types'

/** Short-lived assistant jobs use polling so IPC stays responsive during model generation. */
export class AssistantService {
  private tasks = new Map<string, { state: AssistantTask; controller: AbortController }>()
  private probes = new Set<AbortController>()
  constructor(readonly connections: ConnectionStore) {}
  async handle(raw: AiCommand): Promise<unknown> {
    const command = aiCommandSchema.parse(raw)
    switch (command.action) {
      case 'state': return this.connections.state(command.profileId)
      case 'save': return this.connections.save(command.profileId, command.configuration, command.enabled)
      case 'models': {
        if (this.probes.size >= 2) throw new Error('Проверка списка моделей уже выполняется.')
        const controller = new AbortController(); this.probes.add(controller)
        const timer = setTimeout(() => controller.abort(new Error('Ollama не ответила за 8 секунд.')), 8000)
        try { return await new OllamaProvider({ provider: 'ollama', port: command.port, model: 'local' }).list(controller.signal) }
        finally { clearTimeout(timer); this.probes.delete(controller) }
      }
      case 'start': return this.start(command.profileId, command.input)
      case 'get': return structuredClone(this.owned(command.profileId, command.id).state)
      case 'cancel': {
        const task = this.owned(command.profileId, command.id)
        if (task.state.status === 'running') { task.state.status = 'cancelled'; task.state.message = 'Запрос остановлен.'; task.controller.abort(new Error('Запрос остановлен.')) }
        return structuredClone(task.state)
      }
      case 'remove': {
        const task = this.owned(command.profileId, command.id)
        if (task.state.status === 'running') throw new Error('Сначала остановите запрос.')
        this.tasks.delete(command.id); return null
      }
    }
  }
  private owned(profileId: string, id: string) {
    const task = this.tasks.get(id)
    if (!task || task.state.profileId !== profileId) throw new Error('Запрос недоступен этому профилю.')
    return task
  }
  private start(profileId: AssistantTask['profileId'], input: AssistantInput): AssistantTask {
    const own = [...this.tasks.values()].filter(task => task.state.profileId === profileId)
    if (own.some(task => task.state.status === 'running')) throw new Error('В профиле уже выполняется запрос помощника.')
    for (const task of own.slice(0, Math.max(0, own.length - 9))) this.tasks.delete(task.state.id)
    const connection = this.connections.state(profileId).connection
    if (!connection?.enabled) throw new Error('Сначала сохраните и включите подключение модели.')
    const model = connection.configuration.model, provider = this.connections.resolve(profileId, model), controller = new AbortController()
    const state: AssistantTask = { id: randomUUID(), profileId, status: 'running', mode: input.mode, result: null, message: '', trace: [] }
    this.tasks.set(state.id, { state, controller })
    void this.generate(provider, model, input, controller.signal, event => {
      if (state.status !== 'running') return
      if (state.trace.length >= 100) throw new Error('Превышен размер журнала помощника.')
      state.trace.push(structuredClone(event))
    }).then(result => { if (state.status === 'running') { state.result = result; state.status = 'succeeded' } })
      .catch(error => { if (state.status === 'running') { state.status = 'failed'; state.message = error instanceof Error ? error.message.slice(0, 4000) : 'Ошибка модели.' } })
    return structuredClone(state)
  }
  private async generate(provider: ModelProvider, model: string, input: AssistantInput, signal: AbortSignal, trace: Parameters<typeof runAgent>[3]): Promise<JsonValue> {
    const limits = { ...defaultAgentLimits, maxCalls: 1, maxToolCalls: 0, timeoutMs: 180000 }
    if (input.mode === 'test') {
      const result = await runAgent(provider, { model, system: 'Use the inspect_input tool exactly once. Then say OK.', input: 'Test the required local tool.', temperature: 0,
        limits: { ...limits, maxCalls: 2, maxToolCalls: 1, maxOutputTokens: 256 },
        tools: [{ name: 'inspect_input', description: 'Required connection capability test.', parameters: { type: 'object', properties: {}, additionalProperties: false }, async execute() { return { inspected: true } } }],
        requiredTools: ['inspect_input'],
      }, signal, trace)
      const structured = await runAgent(provider, { model, system: 'Return JSON {"ok":true}.', input: 'Test structured output.', temperature: 0,
        limits: { ...limits, maxOutputTokens: 256 }, tools: [], outputSchema: { type: 'object', properties: { ok: { const: true } }, required: ['ok'], additionalProperties: false },
      }, signal, trace)
      return { model, local: true, tools: true, structuredOutput: true, inputTokens: result.inputTokens + structured.inputTokens, outputTokens: result.outputTokens + structured.outputTokens }
    }
    const schema = input.mode === 'design' ? designProposalSchema : personalizationSchema
    const outputSchema = z.toJSONSchema(schema) as Record<string, JsonValue>
    const system = input.mode === 'design'
      ? 'Ты помощник проектирования Workflow Architect. Отвечай по-русски строго по JSON Schema. Если замысел неясен, задай до 3 вопросов; nodes и edges тогда пустые. Иначе предложи ДОБАВЛЕНИЕ до 12 узлов к текущему графу, не меняй существующие. key — уникальное число 0..11. trigger — только ручной, agent — локальная Ollama, tool — только проверка текста text-statistics, artifact — Markdown. Для Agent заполни role и systemPrompt; остальные поля всегда присутствуют, можно пустые строки. Передача результата от Trigger к Agent, от Agent к Agent и от Agent к Artifact ВСЕГДА использует type flow. Пример цепочки из четырёх узлов с key 0,1,2,3: edges=[{"source":0,"target":1,"type":"flow"},{"source":1,"target":2,"type":"flow"},{"source":2,"target":3,"type":"flow"}]. Если пользователь не просит инструмент, не создавай Tool и ни одной связи tool-access. Tool-access допустим исключительно от agent к отдельному узлу типа tool; это не передача текста следующему агенту. Не обещай веб-поиск, Telegram, shell, Codex, файлы или другие API. Для будущей возможности используй concept и поясни ограничение. Не добавляй циклы. Не меняй разрешения или настройки. Предложение рассматривает человек.'
      : 'Ты помощник настройки Workflow Architect. По ответам анкеты, текущим настройкам и описанию пробной задачи предложи 2 или 3 РАЗЛИЧАЮЩИХСЯ варианта предпочтений интерфейса. Ответ по-русски строго по JSON Schema. Объясни каждый выбор на основе ответа пользователя. Не утверждай, что пользователь чему-то научился, если это не подтверждено. Не обещай обучение модели или автоматическое освоение за определённое время. Не меняй настройки, права, credentials или лимиты выполнения. detail guided — основные поля; technical — все; density comfortable/compact; motion system/reduced; defaultMode concept/engineering. favoriteTemplates: research, content, automation. Пользователь выберет вариант или отредактирует его.'
    const result = await runAgent(provider, { model, system, input: input as unknown as JsonValue, tools: [], temperature: 0.2, limits, outputSchema }, signal, trace)
    return schema.parse(result.output) as JsonValue
  }
  closeWindow() { for (const task of this.tasks.values()) if (task.state.status === 'running') { task.state.status = 'cancelled'; task.state.message = 'Окно закрыто.'; task.controller.abort(new Error('Окно закрыто.')) }; for (const probe of this.probes) probe.abort() }
  stop() { this.closeWindow(); this.connections.stop() }
}
