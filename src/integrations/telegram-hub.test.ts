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

const cleanups: (() => void)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) cleanup(); await new Promise(resolve => setTimeout(resolve, 20)) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wa-telegram-test-'))
  const connections = new IntegrationConnections(join(root, 'connections')), effects = new EffectStore(join(root, 'effects')), sources = new SourceStore(join(root, 'sources')), inbox = new TelegramInbox(join(root, 'inbox')), jobs = new JobManager(join(root, 'jobs'))
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
  const bind = (profileId: typeof profileIds[number], chatId: string) => {
    const connection = connections.save({ version: '0.5', id: createId(), profileId, label: 'Bot', enabled: true, revision: 0, settings: { kind: 'telegram', credentialId: createId() } })
    const workflow = sources.publish(profileId, 'Article', project, trigger.id)
    const binding = sources.saveBinding({ version: '0.5', id: createId(), profileId, connectionId: connection.id, botId: '999999', chatId, userId: chatId, workflowId: workflow.id, lastJobId: null })
    return { connection, workflow, binding }
  }
  cleanups.push(() => { hub.stop(); jobs.stop(); connections.stop(); setTimeout(() => { if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}wa-telegram-test-`)) throw new Error('Unsafe cleanup'); rmSync(root, { recursive: true, force: true }) }, 10) })
  return { root, updates, sent, connections, sources, inbox, jobs, broker, hub, project, bind }
}
const message = (id: number, chat: number, text: string, type = 'private', from = chat): TelegramUpdate => ({ update_id: id, message: { message_id: id, from: { id: from, is_bot: false }, chat: { id: chat, type }, text } })
describe('Telegram durable remote workflow', () => {
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
