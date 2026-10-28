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
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createId, createNode, createProject, createEdge } from '../domain/factories'
import { configureOperation } from '../execution/configure-operation'
import { profileIds } from '../profiles/schema'
import { IntegrationConnections } from './connection-store'
import { EffectStore } from './effect-store'
import { FilesystemMcp } from './mcp'
import { IntegrationBroker } from './broker'
import { SourceStore } from './source-store'
import { TelegramInbox } from './telegram-inbox'
import { TelegramHub } from './telegram-hub'
import { JobManager } from '../runtime/job-manager'
import type { TelegramUpdate } from './telegram-api'
import type { JsonTransport } from './network'
import type { ModelProvider, ModelResponse } from '../ai/types'
import { mkdir, writeFile } from 'node:fs/promises'
import { KnowledgeService } from '../knowledge/service'
import { KnowledgeRuntime } from '../knowledge/runtime'
import { defaultAgentKnowledge } from '../domain/knowledge-config'
import { createEditorialExample } from '../execution/editorial-example'

const cleanups: (() => void)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) cleanup(); await new Promise(resolve => setTimeout(resolve, 20)) })
function fixture(jobOptions?: (root: string) => ConstructorParameters<typeof JobManager>[1]) {
  const root = mkdtempSync(join(tmpdir(), 'wa-telegram-test-'))
  const connections = new IntegrationConnections(join(root, 'connections')), effects = new EffectStore(join(root, 'effects')), sources = new SourceStore(join(root, 'sources')), inbox = new TelegramInbox(join(root, 'inbox')), jobs = new JobManager(join(root, 'jobs'), jobOptions?.(root))
  const updates: TelegramUpdate[] = [], sent: { method: string; body: string }[] = []
  let nextMessage = 1
  const transport: JsonTransport = async request => {
    const method = request.url.pathname.split('/').at(-1)!
    if (method === 'getUpdates') {
      if (!updates.length) await new Promise<void>(resolve => { const timer = setTimeout(resolve, 20); request.signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true }) })
      request.signal.throwIfAborted()
      return { ok: true, result: updates.splice(0) }
    }
    if (method === 'getMe') return { ok: true, result: { id: 999999, is_bot: true, username: 'test_bot' } }
    if (method === 'getWebhookInfo') return { ok: true, result: { url: '' } }
    sent.push({ method, body: String(request.body) }); return { ok: true, result: { message_id: nextMessage++ } }
  }
  const broker = new IntegrationBroker(connections, effects, new FilesystemMcp('unused'), async () => '999999:abcdefghijklmnopqrstuvwxyz', transport, (profileId, connectionId, chatId) => sources.listBindings(profileId).some(binding => binding.connectionId === connectionId && binding.chatId === chatId))
  const hub = new TelegramHub(broker, sources, inbox, jobs)
  const project = createProject('Remote article'), trigger = configureOperation(createNode('trigger'), 'telegram-message'), human = configureOperation(createNode('human'), 'human'), artifact = configureOperation(createNode('artifact'), 'artifact')
  project.nodes = [trigger, human, artifact]
  project.edges = [createEdge(trigger.id, human.id, trigger.ports.find(port => port.direction === 'output')!.id, human.ports.find(port => port.direction === 'input')!.id), createEdge(human.id, artifact.id, human.ports.find(port => port.direction === 'output')!.id, artifact.ports.find(port => port.direction === 'input')!.id)]
  const bind = (profileId: typeof profileIds[number], chatId: string, entryNodeId = trigger.id) => {
    const connection = connections.save({ version: '0.5', id: createId(), profileId, label: 'Bot', enabled: true, revision: 0, settings: { kind: 'telegram', credentialId: createId() } })
    const workflow = sources.publish(profileId, 'Article', project, entryNodeId)
    const binding = sources.saveBinding({ version: '0.5', id: createId(), profileId, connectionId: connection.id, botId: '999999', chatId, userId: chatId, workflowId: workflow.id, lastJobId: null })
    return { connection, workflow, binding }
  }
  cleanups.push(() => { hub.stop(); jobs.stop(); connections.stop(); setTimeout(() => { if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}wa-telegram-test-`)) throw new Error('Unsafe cleanup'); rmSync(root, { recursive: true, force: true }) }, 10) })
  return { root, updates, sent, connections, sources, inbox, jobs, broker, hub, project, bind }
}
const message = (id: number, chat: number, text: string, type = 'private', from = chat): TelegramUpdate => ({ update_id: id, message: { message_id: id, from: { id: from, is_bot: false }, chat: { id: chat, type }, text } })
describe('Telegram durable remote workflow', () => {
  it('delivers the exact review file before Human buttons and the final article only after approval', async () => {
    let knowledge!: KnowledgeService
    const article = `# Статья\n\n## Выбор\n${'Пример '.repeat(310)}\n\n## Примерка\n${'Движение '.repeat(310)}`
    const provider: ModelProvider = { id: 'test', costPerMillionInput: 0, costPerMillionOutput: 0,
      list: async () => ['fixture'], identity: async () => 'a'.repeat(64), inspect: async () => ({ tools: false, thinking: false, contextTokens: 32768 }),
      chat: async request => ({ content: request.messages[0]!.content.includes('Подготовь краткий') ? 'План' : request.outputSchema ? '{"verdict":"ready-for-human","comments":[]}' : article, toolCalls: [], inputTokens: 100, outputTokens: 100, finish: 'stop' }),
    }
    const f = fixture(root => { knowledge = new KnowledgeService(join(root, 'knowledge')); return { knowledge: new KnowledgeRuntime(knowledge), provider: () => () => provider } })
    const sourcePath = join(f.root, 'source')
    await mkdir(join(sourcePath, 'source/current'), { recursive: true })
    await writeFile(join(sourcePath, 'source/current/product.json'), '{"sku":"TG-A","care":"Холодная стирка"}')
    const preview = await knowledge.prepare({ profileId: profileIds[0], label: 'Editorial source', sourcePath, selectedPaths: ['source/current/product.json'] })
    const collectionId = knowledge.commit(profileIds[0], preview.token)
    const project = createEditorialExample('fixture', { ...defaultAgentKnowledge, sku: 'TG-A', collections: [{ collectionId }] })
    const manual = project.nodes.find(node => node.operation?.kind === 'manual')!
    f.project.nodes = project.nodes.filter(node => node.id !== manual.id)
    f.project.edges = project.edges.filter(edge => edge.sourceNode !== manual.id)
    const { binding } = f.bind(profileIds[0], '101', f.project.nodes[0]!.id)
    f.jobs.start(); f.hub.start(); f.updates.push(message(300, 101, 'Опиши TG-A'))
    await vi.waitFor(() => expect(f.jobs.list(profileIds[0])[0]?.status).toBe('waiting'))
    const jobId = f.sources.binding(profileIds[0], binding.id).lastJobId!
    const job = f.jobs.get(profileIds[0], jobId), request = job.checkpoint!.frames.at(-1)!.human!.request
    expect(request.editorial?.text).toBe(article)
    const task = JSON.parse(job.preparedKnowledge![0]!.packet.task)
    expect(task).not.toHaveProperty('chatId')
    expect(task).not.toHaveProperty('userId')
    await f.hub.notify(); await f.hub.notify()
    expect(f.sent.filter(item => item.method === 'sendDocument')).toHaveLength(1)
    const question = f.sent.findIndex(item => item.body.includes(request.id) && item.method === 'sendMessage')
    expect(question).toBeGreaterThan(f.sent.findIndex(item => item.method === 'sendDocument'))
    expect(f.sent[question]!.body).toContain(request.editorial!.digest)
    expect(job.outcome?.artifacts ?? []).toEqual([])
    f.updates.push({ update_id: 301, callback_query: { id: 'editorial-approval', from: { id: 101, is_bot: false }, data: `h:${request.id}:1`, message: { message_id: 1, chat: { id: 101, type: 'private' } } } })
    await vi.waitFor(() => expect(f.jobs.get(profileIds[0], jobId).status).toBe('succeeded'))
    await f.hub.notify(); await f.hub.notify()
    expect(f.sent.filter(item => item.method === 'sendDocument')).toHaveLength(2)
    expect(f.jobs.get(profileIds[0], jobId).outcome!.artifacts[0]!.content).toBe(article)
    f.updates.push(message(302, 101, '/edit Добавь вывод, сохрани остальные разделы'))
    await vi.waitFor(() => expect(f.sources.binding(profileIds[0], binding.id).lastJobId).not.toBe(jobId))
    const editedId = f.sources.binding(profileIds[0], binding.id).lastJobId!
    await vi.waitFor(() => expect(f.jobs.get(profileIds[0], editedId).status).toBe('waiting'))
    const edited = f.jobs.get(profileIds[0], editedId), next = edited.checkpoint!.frames.at(-1)!.human!.request
    expect(Object.values(edited.checkpoint!.editorial!)[0]!.task.previousArticle).toBe(article)
    expect(next.editorial!.id).not.toBe(request.editorial!.id)
    expect(next.editorial!.taskId).not.toBe(request.editorial!.taskId)
    expect(edited.outcome?.artifacts ?? []).toEqual([])
    await f.hub.notify(); await f.hub.notify()
    expect(f.sent.filter(item => item.method === 'sendDocument')).toHaveLength(3)
    f.updates.push({ update_id: 303, callback_query: { id: 'editorial-stale', from: { id: 101, is_bot: false }, data: `h:${request.id}:1`, message: { message_id: 1, chat: { id: 101, type: 'private' } } } })
    await vi.waitFor(() => expect(f.inbox.event('999999', 303)?.error).toContain('Подтверждение устарело'))
    expect(f.jobs.get(profileIds[0], editedId).status).toBe('waiting')
    f.updates.push({ update_id: 304, callback_query: { id: 'editorial-new', from: { id: 101, is_bot: false }, data: `h:${next.id}:1`, message: { message_id: 2, chat: { id: 101, type: 'private' } } } })
    await vi.waitFor(() => expect(f.jobs.get(profileIds[0], editedId).status).toBe('succeeded'))
    await f.hub.notify(); await f.hub.notify()
    expect(f.sent.filter(item => item.method === 'sendDocument')).toHaveLength(4)
  })
  it('delivers the bound profile snapshot to Agent and preserves its evidence for Telegram runs', async () => {
    let knowledge!: KnowledgeService
    const chat = vi.fn<ModelProvider['chat']>(async () => ({ content: 'Описание по источнику', toolCalls: [], inputTokens: 300, outputTokens: 20, finish: 'stop' }))
    const provider: ModelProvider = { id: 'test', costPerMillionInput: 0, costPerMillionOutput: 0, list: async () => [], inspect: async () => ({ tools: false, thinking: false, contextTokens: 32768 }), chat }
    const f = fixture(root => {
      knowledge = new KnowledgeService(join(root, 'knowledge'))
      return { knowledge: new KnowledgeRuntime(knowledge), provider: () => () => provider }
    })
    const sourcePath = join(f.root, 'source')
    await mkdir(join(sourcePath, 'source/current'), { recursive: true })
    await writeFile(join(sourcePath, 'source/current/product.json'), JSON.stringify({ sku: 'TG-A', care: 'Только холодная стирка', composition: null }))
    const preview = await knowledge.prepare({ profileId: profileIds[0], label: 'Telegram source', sourcePath, selectedPaths: ['source/current/product.json'] })
    const collectionId = knowledge.commit(profileIds[0], preview.token)
    const trigger = f.project.nodes[0]!, agent = configureOperation(createNode('agent'), 'agent'), artifact = f.project.nodes[2]!
    if (agent.type !== 'agent' || agent.operation?.kind !== 'agent') throw new Error('Expected Agent')
    agent.config = { role: 'Редактор', model: { provider: 'ollama', name: 'fixture' }, systemPrompt: 'Используй источники.' }
    agent.operation.requireTools = false
    agent.operation.minimumWords = 0
    agent.operation.knowledge = { ...defaultAgentKnowledge, sku: 'TG-A', collections: [{ collectionId }] }
    f.project.nodes = [trigger, agent, artifact]
    f.project.edges = [[trigger, agent], [agent, artifact]].map(([a, b]) => createEdge(a!.id, b!.id, a!.ports.find(port => port.direction === 'output')!.id, b!.ports.find(port => port.direction === 'input')!.id))
    const { binding } = f.bind(profileIds[0], '101')
    f.updates.push(message(80, 101, '/run Опиши TG-A'))
    f.hub.start()
    await vi.waitFor(() => expect(f.jobs.list(profileIds[0])).toHaveLength(1))
    const id = f.sources.binding(profileIds[0], binding.id).lastJobId!
    const queued = f.jobs.get(profileIds[0], id)
    expect(queued.preparedKnowledge![0]!.packet.task).toContain('Опиши TG-A')
    await writeFile(join(sourcePath, 'source/current/product.json'), JSON.stringify({ sku: 'TG-A', care: 'Изменено после очереди' }))
    f.jobs.start()
    await vi.waitFor(() => expect(f.jobs.get(profileIds[0], id).status).toBe('succeeded'))
    expect(chat.mock.calls[0]![0].messages[1]!.content).toContain('Только холодная стирка')
    expect(chat.mock.calls[0]![0].messages[1]!.content).not.toContain('Изменено после очереди')
    const event = f.jobs.get(profileIds[0], id).events.find(event => event.kind === 'knowledge')!
    expect(event.kind === 'knowledge' && event.packet.handoff?.taskId).toBe(id)
    expect(f.jobs.list(profileIds[1])).toEqual([])
    await f.hub.notify()
    expect(f.sent.filter(item => item.method === 'sendDocument')).toHaveLength(1)
  })
  it('preserves a newer chat publication while a model classifies an earlier message', async () => {
    const f = fixture(), { binding, workflow } = f.bind(profileIds[0], '101')
    let resolveResponse!: (value: ModelResponse) => void
    const response = new Promise<ModelResponse>(resolve => { resolveResponse = resolve })
    const provider: ModelProvider = { id: 'test', costPerMillionInput: 0, costPerMillionOutput: 0, list: async () => [], inspect: async () => ({ tools: false, thinking: false, contextTokens: 8192 }), chat: vi.fn(() => response) }
    const hub = new TelegramHub(f.broker, f.sources, f.inbox, f.jobs, () => ({ provider, model: 'test' }))
    cleanups.push(() => hub.stop())
    f.updates.push(message(90, 101, 'Long classification'))
    hub.start()
    await vi.waitFor(() => expect(provider.chat).toHaveBeenCalledOnce())
    const newer = f.sources.publish(profileIds[0], 'New scenario', f.project, f.project.nodes[0]!.id)
    f.sources.selectWorkflow(profileIds[0], binding.id, newer.id, workflow.id)
    resolveResponse({ content: '{"kind":"create"}', toolCalls: [], inputTokens: 1, outputTokens: 1, finish: 'stop' })
    await vi.waitFor(() => expect(f.jobs.list(profileIds[0])).toHaveLength(1))
    expect(f.sources.binding(profileIds[0], binding.id).workflowId).toBe(newer.id)
    expect(f.sources.binding(profileIds[0], binding.id).lastJobId).not.toBeNull()
    expect(f.inbox.event('999999', 90)?.workflowId).toBe(workflow.id)
  })
  it('offers a keyboard, freezes guided input across restart, and keeps navigation separate from Human', async () => {
    const f = fixture(), first = f.bind(profileIds[0], '101'), second = f.bind(profileIds[1], '202')
    const model = vi.fn(() => { throw new Error('Navigation must not call a model') })
    const hub = new TelegramHub(f.broker, f.sources, f.inbox, f.jobs, model)
    cleanups.push(() => hub.stop())
    f.updates.push(message(100, 101, '/help'), message(101, 101, 'Новый текст'), message(102, 202, 'Сценарий'))
    hub.start()
    await vi.waitFor(() => expect(f.inbox.offset('999999')).toBe(103))
    expect(f.jobs.list(profileIds[0])).toHaveLength(0)
    expect(f.sources.dialogue(profileIds[1], second.binding.id)).toBeNull()
    expect(f.sent.some(item => JSON.parse(item.body).reply_markup?.keyboard?.[0]?.[0]?.text === 'Новый текст')).toBe(true)
    hub.stop()
    const restoredSources = new SourceStore(join(f.root, 'sources')), restoredInbox = new TelegramInbox(join(f.root, 'inbox'))
    expect(restoredSources.dialogue(profileIds[0], first.binding.id)?.mode).toBe('create')
    const restored = new TelegramHub(f.broker, restoredSources, restoredInbox, f.jobs, model)
    cleanups.push(() => restored.stop())
    f.jobs.start()
    f.updates.push(message(103, 101, 'Тема статьи'), message(103, 101, 'Тема статьи'))
    restored.start()
    await vi.waitFor(() => expect(f.jobs.list(profileIds[0])[0]?.status).toBe('waiting'))
    const id = restoredSources.binding(profileIds[0], first.binding.id).lastJobId!
    expect(f.jobs.get(profileIds[0], id).input).toMatchObject({ text: 'Тема статьи' })
    expect(restoredSources.dialogue(profileIds[0], first.binding.id)).toBeNull()
    expect(f.jobs.list(profileIds[0])).toHaveLength(1)
    f.updates.push(message(104, 101, 'Статус'), message(105, 101, 'Сценарий'), message(106, 101, 'Правки'))
    await vi.waitFor(() => expect(restoredInbox.offset('999999')).toBe(107))
    expect(f.jobs.get(profileIds[0], id).status).toBe('waiting')
    expect(f.jobs.get(profileIds[0], id).events.filter(event => event.kind === 'human-answer')).toHaveLength(0)
    expect(model).not.toHaveBeenCalled()
    const request = f.jobs.get(profileIds[0], id).checkpoint!.frames.at(-1)!.human!.request
    expect(f.jobs.answer(profileIds[0], id, request.id, true).ok).toBe(true)
    await vi.waitFor(() => expect(f.jobs.get(profileIds[0], id).status).toBe('succeeded'))
    f.updates.push(message(107, 101, 'Правки'), message(108, 101, 'Добавь чек-лист'))
    await vi.waitFor(() => expect(f.jobs.list(profileIds[0])).toHaveLength(2))
    const edited = f.jobs.get(profileIds[0], restoredSources.binding(profileIds[0], first.binding.id).lastJobId!)
    expect(edited.input).toMatchObject({ text: 'Добавь чек-лист', previousArticle: f.jobs.get(profileIds[0], id).outcome!.artifacts.at(-1)!.content })
    expect(model).not.toHaveBeenCalled()
  })
  it('rejects a stale guided scenario, expires prompts, and isolates dialogue ownership', async () => {
    const f = fixture(), { binding } = f.bind(profileIds[0], '101')
    const dialogue = f.sources.beginDialogue(profileIds[0], binding.id, 'create', 200)
    expect(() => f.sources.dialogue(profileIds[1], binding.id)).toThrow('профилю')
    expect(() => f.sources.consumeDialogue(profileIds[1], binding.id)).toThrow('профилю')
    const replacement = f.sources.publish(profileIds[0], 'Replacement', f.project, f.project.nodes[0]!.id)
    f.sources.selectWorkflow(profileIds[0], binding.id, replacement.id)
    f.updates.push(message(201, 101, 'Must not run changed scenario'))
    f.hub.start()
    await vi.waitFor(() => expect(f.inbox.offset('999999')).toBe(202))
    expect(f.jobs.list(profileIds[0])).toHaveLength(0)
    expect(f.inbox.event('999999', 201)?.guided?.mode).toBe('changed')
    f.sources.beginDialogue(profileIds[0], binding.id, 'create', 202)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(dialogue.expiresAt + 60_000)
    try {
      f.updates.push(message(203, 101, 'Too late'))
      await vi.waitFor(() => expect(f.inbox.offset('999999')).toBe(204))
      expect(f.inbox.event('999999', 203)?.guided?.mode).toBe('expired')
      expect(f.jobs.list(profileIds[0])).toHaveLength(0)
    } finally { clock.mockRestore() }
    f.updates.push(message(204, 101, '/run Plain command text'))
    await vi.waitFor(() => expect(f.jobs.list(profileIds[0])).toHaveLength(1))
    expect(f.jobs.get(profileIds[0], f.sources.binding(profileIds[0], binding.id).lastJobId!).input).toMatchObject({ text: 'Plain command text' })
  })
  it('ignores strangers/groups, registers before acknowledging and deduplicates repeated updates across profiles', async () => {
    const f = fixture(), first = f.bind(profileIds[0], '101'), second = f.bind(profileIds[1], '202')
    f.updates.push(message(1, 303, 'stranger'), message(2, 101, 'group', 'group'), message(3, 101, 'Статья'), message(3, 101, 'Статья'), message(4, 202, 'Другая статья'))
    f.hub.start()
    await vi.waitFor(() => expect(f.jobs.list(profileIds[1])).toHaveLength(1))
    expect(f.jobs.list(profileIds[0])).toHaveLength(1)
    expect(new TelegramInbox(join(f.root, 'inbox')).offset('999999')).toBe(5)
    expect(new TelegramInbox(join(f.root, 'inbox')).pending('999999')).toEqual([])
    expect(f.sources.binding(profileIds[0], first.binding.id).lastJobId).not.toBe(f.sources.binding(profileIds[1], second.binding.id).lastJobId)
    await expect(f.broker.execute(profileIds[0], first.connection.id, 'wrong-chat', 'telegram.send-message', { chatId: '202', text: 'no' }, new AbortController().signal)).rejects.toThrow('не привязан')
  })
  it('accepts Human approval only from the bound user for the current request and delivers a file once', async () => {
    const f = fixture(), { binding } = f.bind(profileIds[0], '101')
    f.jobs.start(); f.updates.push(message(10, 101, 'Подготовь статью')); f.hub.start()
    await vi.waitFor(() => expect(f.jobs.list(profileIds[0])[0]?.status).toBe('waiting'))
    const id = f.sources.binding(profileIds[0], binding.id).lastJobId!, job = f.jobs.get(profileIds[0], id), request = job.checkpoint!.frames.at(-1)!.human!.request
    await f.hub.notify()
    const callback = (updateId: number, user: number): TelegramUpdate => ({ update_id: updateId, callback_query: { id: `callback${updateId}`, from: { id: user, is_bot: false }, data: `h:${request.id}:1`, message: { message_id: 1, chat: { id: 101, type: 'private' } } } })
    f.updates.push(callback(11, 202)); await vi.waitFor(() => expect(f.inbox.offset('999999')).toBe(12))
    expect(f.jobs.get(profileIds[0], id).status).toBe('waiting')
    f.updates.push(callback(12, 101))
    await vi.waitFor(() => expect(f.jobs.get(profileIds[0], id).status).toBe('succeeded'))
    await f.hub.notify(); await f.hub.notify()
    expect(f.sent.filter(item => item.method === 'sendDocument')).toHaveLength(1)
    f.updates.push(callback(13, 101)); await vi.waitFor(() => expect(f.inbox.offset('999999')).toBe(14))
    expect(f.jobs.get(profileIds[0], id).events.filter(event => event.kind === 'human-answer')).toHaveLength(1)
  })
  it('keeps a published snapshot unchanged after Canvas edits and disables new starts explicitly', () => {
    const f = fixture(), { workflow } = f.bind(profileIds[0], '101')
    f.project.project.name = 'Edited'
    expect(f.sources.workflow(profileIds[0], workflow.id).project.project.name).toBe('Remote article')
    expect(() => f.sources.workflow(profileIds[1], workflow.id)).toThrow('профиля')
    f.sources.disableWorkflow(profileIds[0], workflow.id)
    expect(() => f.sources.workflow(profileIds[0], workflow.id)).toThrow('не опубликован')
  })
})
