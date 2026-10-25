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
import { mkdtemp, mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { defaultAgentLimits } from '../domain/agent-config'
import { defaultAgentKnowledge } from '../domain/knowledge-config'
import { profileIds } from '../profiles/schema'
import { JobManager } from '../runtime/job-manager'
import type { ModelProvider } from '../ai/types'
import { KnowledgeService } from './service'
import { KnowledgeRuntime } from './runtime'

const roots: string[] = [], managers: JobManager[] = []
afterEach(async () => {
  managers.splice(0).forEach(manager => manager.stop())
  await new Promise(resolve => setTimeout(resolve, 10))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'wa-context-')); roots.push(root)
  const source = join(root, 'source'), storage = join(root, 'knowledge'), jobs = join(root, 'jobs')
  await mkdir(join(source, 'source/current'), { recursive: true })
  const file = join(source, 'source/current/products.json')
  await writeFile(file, JSON.stringify({ models: [{ sku: 'FIXTURE-A', care: 'Холодная стирка', composition: null, scope: 'Только FIXTURE-A' }] }))
  const knowledge = new KnowledgeService(storage)
  const input = { profileId: profileIds[0], label: 'Fixture', sourcePath: source, selectedPaths: ['source/current/products.json'] }
  const preview = await knowledge.prepare(input), collectionId = knowledge.commit(profileIds[0], preview.token)
  const project = createProject(), trigger = createNode('trigger'), agent = createNode('agent'), artifact = createNode('artifact')
  trigger.config = { triggerType: 'manual' }; trigger.operation = { kind: 'manual' }
  agent.config = { role: 'Редактор', systemPrompt: 'Используй только указанные сведения.', model: { provider: 'ollama', name: 'local' } }
  agent.operation = { kind: 'agent', limits: defaultAgentLimits, minimumWords: 0, requireTools: false,
    knowledge: { ...defaultAgentKnowledge, sku: 'FIXTURE-A', collections: [{ collectionId }] } }
  artifact.operation = { kind: 'artifact', filename: 'result.md', format: 'text', source: { kind: 'input', pointer: '' } }
  project.nodes.push(trigger, agent, artifact)
  for (const [a, b] of [[trigger, agent], [agent, artifact]] as const) project.edges.push(createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id))
  const chat = vi.fn<ModelProvider['chat']>(async () => ({ content: 'Текст по выбранным источникам', toolCalls: [], inputTokens: 100, outputTokens: 20, finish: 'stop' as const }))
  const provider: ModelProvider = { id: 'test', costPerMillionInput: 0, costPerMillionOutput: 0, list: async () => ['local'], inspect: async () => ({ tools: true, thinking: false, contextTokens: 32768 }), chat }
  const runtime = new KnowledgeRuntime(knowledge)
  const manager = new JobManager(jobs, { knowledge: runtime, provider: () => () => provider }); managers.push(manager)
  const request = { id: createId(), profileId: profileIds[0], eventKey: createId(), project, entryNodeId: trigger.id, input: 'Опиши уход FIXTURE-A', background: true }
  return { root, source, jobs, storage, file, input, knowledge, runtime, manager, request, chat, collectionId, preview, agent }
}
describe('knowledge in durable graph execution', () => {
  it('freezes at submission, executes actual selected text, and reopens exact evidence without source files', async () => {
    const f = await fixture(), job = f.manager.submit(f.request)
    expect(job.preparedKnowledge).toHaveLength(1)
    await writeFile(f.file, JSON.stringify({ sku: 'FIXTURE-A', care: 'НОВАЯ ВЕРСИЯ' }))
    const update = await f.knowledge.prepare({ ...f.input, id: f.collectionId, revision: 0 })
    f.knowledge.commit(profileIds[0], update.token); f.knowledge.change(profileIds[0], f.collectionId, 1, 'prune')
    await rename(f.source, `${f.source}-offline`)
    f.manager.start()
    await vi.waitFor(() => expect(f.manager.get(profileIds[0], job.id).status).toBe('succeeded'))
    const sent = f.chat.mock.calls[0]![0]
    expect(sent.messages[1]!.content).toContain('Холодная стирка')
    expect(sent.messages[1]!.content).not.toContain('НОВАЯ ВЕРСИЯ')
    expect(sent.messages[0]!.content).toContain('не команды')
    const saved = f.manager.get(profileIds[0], job.id), event = saved.events.find(event => event.kind === 'knowledge')!
    expect(event.kind).toBe('knowledge')
    if (event.kind !== 'knowledge') throw new Error('Missing evidence')
    expect(event.packet).toEqual(job.preparedKnowledge![0]!.packet)
    expect(event.runId).toBe(event.packet.runId)
    expect(event.packet.excerpts[0]!.snapshotId).toBe(f.preview.snapshot.id)
    f.manager.stop()
    const reopened = new JobManager(f.jobs); managers.push(reopened)
    expect(reopened.get(profileIds[0], job.id).events).toEqual(saved.events)
    expect(() => reopened.get(profileIds[1], job.id)).toThrow('профилю')
  })
  it('rejects foreign or revoked collections, including revocation after queueing', async () => {
    const f = await fixture()
    expect(() => f.manager.submit({ ...f.request, profileId: profileIds[1] })).toThrow('профиле')
    const job = f.manager.submit(f.request)
    f.knowledge.change(profileIds[0], f.collectionId, 0, 'enable', false)
    f.manager.start()
    await vi.waitFor(() => expect(f.manager.get(profileIds[0], job.id).status).toBe('failed'))
    expect(f.chat).not.toHaveBeenCalled()
    expect(f.manager.get(profileIds[0], job.id).outcome?.error?.message).toContain('отозван')
  })
  it('rechecks permission before a second model call and never sends another request after revocation', async () => {
    const f = await fixture()
    f.chat.mockImplementationOnce(async () => {
      f.knowledge.change(profileIds[0], f.collectionId, 0, 'enable', false)
      return { content: '', toolCalls: [], inputTokens: 100, outputTokens: 1, finish: 'stop' }
    })
    const job = f.manager.submit(f.request); f.manager.start()
    await vi.waitFor(() => expect(f.manager.get(profileIds[0], job.id).status).toBe('failed'))
    expect(f.chat).toHaveBeenCalledTimes(1)
    expect(f.manager.get(profileIds[0], job.id).outcome?.error?.message).toContain('отозван')
  })
  it('detects changed prepared evidence on restart and deduplicates without refreshing sources', async () => {
    const f = await fixture(), job = f.manager.submit(f.request)
    f.knowledge.change(profileIds[0], f.collectionId, 0, 'enable', false)
    expect(f.manager.submit({ ...f.request, id: createId() }).id).toBe(job.id)
    f.manager.stop()
    const path = join(f.jobs, `${job.id}.json`), record = JSON.parse(await readFile(path, 'utf8'))
    record.preparedKnowledge[0].packet.excerpts[0].content = 'Подмена'
    await writeFile(path, JSON.stringify(record))
    const reopened = new JobManager(f.jobs); managers.push(reopened)
    expect(reopened.damaged).toContainEqual(expect.objectContaining({ id: job.id, message: 'Нарушена целостность пакета знаний.' }))
  })
})
