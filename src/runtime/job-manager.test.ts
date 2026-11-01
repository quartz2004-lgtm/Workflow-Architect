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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { createId, createNode, createEdge } from '../domain/factories'
import { createExecutionExample } from '../execution/example'
import { profileIds } from '../profiles/schema'
import { JobManager } from './job-manager'
import { type RuntimeJob, type SubmitJob } from './job-schema'
import { EditorialProcessService } from '../editorial/process-service'
import { createEditorialExample } from '../execution/editorial-example'
import { defaultAgentKnowledge } from '../domain/knowledge-config'
import type { ModelProvider, ModelRequest } from '../ai/types'
import type { RuntimeKnowledge } from '../knowledge/runtime'

const directories: string[] = [], managers: JobManager[] = []
const owner = profileIds[0], other = profileIds[1]
function directory() { const path = mkdtempSync(join(tmpdir(), 'workflow-jobs-test-')); directories.push(path); return path }
function manager(path = directory(), options: ConstructorParameters<typeof JobManager>[1] = {}) { const value = new JobManager(path, options); managers.push(value); return value }
function request(background = true): SubmitJob {
  const project = createExecutionExample(), id = createId()
  return { id, profileId: owner, eventKey: id, project, entryNodeId: project.nodes[0]!.id, input: { approved: true, text: 'durable' }, background }
}
async function status(service: JobManager, id: string, expected: RuntimeJob['status']) { await vi.waitFor(() => expect(service.get(owner, id).status).toBe(expected), { timeout: 5000, interval: 10 }) }
afterEach(async () => {
  for (const service of managers.splice(0)) { try { service.stop() } catch { /* The disk failure test deliberately makes storage unavailable. */ } }
  await new Promise(resolve => setTimeout(resolve, 5))
  for (const path of directories.splice(0)) {
    const local = relative(resolve(tmpdir()), resolve(path))
    if (!local.startsWith('workflow-jobs-test-') || local.includes('..') || local.includes('/') || local.includes('\\')) throw new Error('Unsafe cleanup')
    rmSync(path, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})
describe('durable runtime jobs', () => {
  it('restores an earlier Human wait before fresh queued work takes its slot', async () => {
    const path = directory(), first = manager(path, { concurrency: 1 })
    first.start()
    const waiting = first.submit(request()), queued = first.submit(request())
    await status(first, waiting.id, 'waiting')
    first.stop()
    const restored = manager(path, { concurrency: 1 }); restored.start()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(restored.get(owner, queued.id).status).toBe('queued')
    await status(restored, waiting.id, 'waiting')
    expect(restored.get(owner, queued.id).events).toEqual([])
    restored.cancel(owner, waiting.id)
    await status(restored, queued.id, 'waiting')
  })
  it('grants execution time at first dispatch after queue delay, but never again on restart', async () => {
    const path = directory(), processService = new EditorialProcessService(join(directory(), 'process'))
    const first = manager(path, { editorialProcess: processService })
    const job = first.submit(request()), initialTime = Date.now()
    expect(job.executionStartedAt).toBeNull()
    expect(job.deadline).toBe(job.queueExpiresAt)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(initialTime + 3600000)
    first.start(); await status(first, job.id, 'waiting')
    const started = first.get(owner, job.id)
    expect(started.executionStartedAt).toBe(initialTime + 3600000)
    expect(started.deadline).toBe(initialTime + 3600000 + job.plan.limits.timeoutMs)
    first.stop()
    clock.mockReturnValue(started.deadline + 1)
    const restored = manager(path, { editorialProcess: processService }); restored.start()
    expect(restored.get(owner, job.id).status).toBe('failed')
    expect(restored.get(owner, job.id).deadline).toBe(started.deadline)
  })
  it('expires an unstarted task after its finite queue allowance', async () => {
    const processService = new EditorialProcessService(join(directory(), 'process'))
    const service = manager(undefined, { editorialProcess: processService }), job = service.submit(request())
    vi.spyOn(Date, 'now').mockReturnValue(job.queueExpiresAt! + 1)
    service.start(); await status(service, job.id, 'failed')
    expect(service.get(owner, job.id).executionStartedAt).toBeNull()
    expect(service.get(owner, job.id).events).toEqual([])
  })
  it.each([false, true])('pins process selection across restart and enforces example revocation=%s', async revoke => {
    const path = directory(), processService = new EditorialProcessService(join(directory(), 'process'))
    const content = { title: 'First', instructions: { planner: 'FROZEN FIRST', writer: '', reviewer: '' }, settings: { contextTokens: 32768, maxOutputTokens: 4096, temperature: 0.4, stageTimeoutMs: 10000 }, voiceExampleIds: [] }
    let library = processService.addExample(owner, 0, { text: 'Спокойный пример стиля.', sourceLabel: 'Тест', sourceDigest: 'a'.repeat(64), origin: 'development' })
    const example = library.examples[0]!
    library = processService.acceptExample(owner, library.revision, example.id, example.digest)
    library = processService.saveVersion(owner, library.revision, { ...content, voiceExampleIds: [example.id] })
    const firstId = library.versions[0]!.id
    library = processService.selectVersion(owner, library.revision, firstId)
    const project = createEditorialExample('test-local', { ...defaultAgentKnowledge, collections: [{ collectionId: createId() }] })
    const submission = { ...request(), project, entryNodeId: project.nodes.find(node => node.operation?.kind === 'manual')!.id, input: 'Статья' }
    const calls: ModelRequest[] = []
    const provider: ModelProvider = { id: 'ollama', costPerMillionInput: 0, costPerMillionOutput: 0,
      list: async () => ['test-local'], identity: async () => 'a'.repeat(64), inspect: async () => ({ tools: false, thinking: false, contextTokens: 32768 }),
      chat: async input => { calls.push(input)
        if (revoke && calls.length === 1) processService.revokeExample(owner, processService.read(owner).revision, example.id)
        const body = calls.length === 1 ? 'План' : calls.length === 2 ? `# Текст\n\n## Один\n${'Пример '.repeat(310)}\n\n## Два\n${'Движение '.repeat(310)}` : '{"verdict":"ready-for-human","comments":[]}'
        return { content: body, finish: 'stop', toolCalls: [], inputTokens: 100, outputTokens: 100 }
      },
    }
    const knowledge: RuntimeKnowledge = {
      prepare: (profileId, runId, snapshot) => snapshot.nodes.filter(node => node.operation?.kind === 'agent').map(node => ({ nodeId: node.id, collectionIds: [], packet: { schemaVersion: '0.5.3', profileId: profileId as typeof owner, runId, task: 'Статья', query: 'Статья', excerpts: [], gaps: [], budgetBytes: 16000 } })),
      resolve: (_profileId, _runId, packets, nodeId) => packets.find(packet => packet.nodeId === nodeId)!.packet,
    }
    const initial = manager(path, { editorialProcess: processService, knowledge, provider: () => () => provider })
    const queued = initial.submit(submission)
    expect(queued.recordVersion).toBe('0.5.5')
    expect(queued.preparedProcess!.version.id).toBe(firstId)
    library = processService.saveVersion(owner, library.revision, { ...content, title: 'Second', instructions: { ...content.instructions, planner: 'NEW SECOND' } })
    processService.selectVersion(owner, library.revision, library.versions[1]!.id)
    expect(initial.submit(submission).preparedProcess).toEqual(queued.preparedProcess)
    initial.stop()
    const restored = manager(path, { editorialProcess: processService, knowledge, provider: () => () => provider })
    expect(restored.get(owner, queued.id).preparedProcess).toEqual(queued.preparedProcess)
    restored.start()
    if (revoke) {
      await status(restored, queued.id, 'failed')
      expect(calls).toHaveLength(1)
      expect(JSON.stringify(restored.get(owner, queued.id))).toContain('отозван')
      return
    }
    await status(restored, queued.id, 'waiting')
    expect(calls).toHaveLength(3)
    expect(calls[0]!.messages[0]!.content).toContain('FROZEN FIRST')
    expect(calls[0]!.messages[0]!.content).not.toContain('NEW SECOND')
    expect(calls[1]!.temperature).toBe(0.4)
    const state = Object.values(restored.get(owner, queued.id).checkpoint!.editorial!)[0]!
    expect(state.process!.version.id).toBe(firstId)
  })
  it('detects a tampered queued process and preserves older records without a process', () => {
    const path = directory(), processService = new EditorialProcessService(join(directory(), 'process'))
    const service = manager(path, { editorialProcess: processService })
    const job = service.submit(request())
    expect(job.preparedProcess).toBeNull()
    const file = join(path, `${job.id}.json`), raw = JSON.parse(readFileSync(file, 'utf8'))
    raw.processDigest = 'f'.repeat(64)
    writeFileSync(file, JSON.stringify(raw)); service.stop()
    expect(manager(path, { editorialProcess: processService }).damaged).toHaveLength(1)
    const legacyPath = directory(), legacy = manager(legacyPath), original = legacy.submit(request()); legacy.stop()
    expect(manager(legacyPath, { editorialProcess: processService }).get(owner, original.id).recordVersion).toBe('0.5.4')
  })
  it('resumes a Human wait without replaying an already completed connector effect', async () => {
    const path = directory(), effect = vi.fn(async () => ({ approved: true, text: 'saved' }))
    const project = createExecutionExample(), submission = { ...request(), project, entryNodeId: project.nodes[0]!.id }
    const tool = createNode('tool')
    tool.operation = { kind: 'connector', connectionId: createId(), action: 'files.write', fields: [] }
    const edge = project.edges[0]!
    project.nodes.push(tool)
    project.edges[0] = { ...edge, targetNode: tool.id, targetPort: tool.ports[0]!.id }
    project.edges.push(createEdge(tool.id, edge.targetNode, tool.ports[1]!.id, edge.targetPort))
    const first = manager(path, { connector: () => effect }); first.start()
    const job = first.submit(submission)
    await status(first, job.id, 'waiting')
    const question = first.get(owner, job.id).checkpoint!.frames.at(-1)!.human!.request
    first.stop()
    const second = manager(path, { connector: () => effect }); second.start()
    await status(second, job.id, 'waiting')
    expect(second.answer(owner, job.id, question.id, true).ok).toBe(true)
    await status(second, job.id, 'succeeded')
    expect(effect).toHaveBeenCalledTimes(1)
  })
  it('publishes only on-disk state, accepts Human once, and preserves the actual result after reopening', async () => {
    const path = directory(), observations: [RuntimeJob, RuntimeJob][] = []
    const service = manager(path, { changed: job => observations.push([JSON.parse(readFileSync(join(path, `${job.id}.json`), 'utf8')) as RuntimeJob, job]) })
    service.start()
    const job = service.submit(request())
    await status(service, job.id, 'waiting')
    const saved = service.get(owner, job.id), question = saved.checkpoint!.frames.at(-1)!.human!.request
    expect(service.answer(owner, job.id, question.id, true).ok).toBe(true)
    expect(service.answer(owner, job.id, question.id, true).ok).toBe(false)
    await status(service, job.id, 'succeeded')
    service.stop()
    const reopened = manager(path).get(owner, job.id)
    expect(JSON.parse(reopened.outcome!.artifacts[0]!.content)).toEqual({ result: 'DURABLE' })
    expect(reopened.events.at(-1)?.kind).toBe('status')
    expect(reopened.checkpoint!.sequence).toBe(reopened.events.length)
    expect(observations.length).toBeGreaterThan(5)
    for (const [persisted, published] of observations) expect(persisted).toEqual(published)
  })
  it('deduplicates event keys within a profile, rejects conflicts, and does not treat another profile as the same initiator', () => {
    const service = manager(), submitted = request(), job = service.submit(submitted)
    expect(service.submit({ ...submitted, id: createId(), input: { text: 'durable', approved: true } }).id).toBe(job.id)
    expect(() => service.submit({ ...submitted, id: createId(), input: { text: 'different', approved: true } })).toThrow('другим содержимым')
    expect(service.submit({ ...submitted, id: createId(), profileId: other }).profileId).toBe(other)
    expect(service.list(owner)).toHaveLength(1)
    expect(() => service.get(other, job.id)).toThrow('профилю')
    expect(() => service.cancel(other, job.id)).toThrow('профилю')
    expect(() => service.remove(other, job.id)).toThrow('профилю')
  })
  it('keeps the immutable snapshot even when the submitted object is subsequently edited', () => {
    const service = manager(), submitted = request(), first = service.submit(submitted)
    const changed = first.plan.snapshot
    changed.project.name = 'Changed outside service'
    expect(service.get(owner, first.id).plan.snapshot.project.name).not.toBe('Changed outside service')
    expect(service.get(owner, first.id).fingerprint).toBe(first.fingerprint)
  })
  it('enforces concurrency and advances the queue only after the active slot is released', async () => {
    const service = manager(undefined, { concurrency: 1 })
    service.start()
    const first = service.submit(request()), second = service.submit(request())
    await status(service, first.id, 'waiting')
    expect(service.get(owner, second.id).status).toBe('queued')
    expect(service.get(owner, second.id).events).toEqual([])
    service.cancel(owner, first.id)
    await status(service, second.id, 'waiting')
    expect(service.get(owner, first.id).status).toBe('cancelled')
  })
  it('window close cancels foreground work but leaves explicitly allowed background work waiting', async () => {
    const service = manager()
    service.start()
    const foreground = service.submit(request(false)), background = service.submit(request(true))
    await status(service, foreground.id, 'waiting'); await status(service, background.id, 'waiting')
    const question = service.get(owner, foreground.id).checkpoint!.frames.at(-1)!.human!.request
    service.closeWindow()
    expect(service.get(owner, foreground.id).status).toBe('cancelled')
    expect(service.get(owner, background.id).status).toBe('waiting')
    expect(service.answer(owner, foreground.id, question.id, true).ok).toBe(false)
  })
  it('restarts an allowed background wait with the same question, deadline and journal sequence', async () => {
    const path = directory(), first = manager(path)
    first.start()
    const job = first.submit(request())
    await status(first, job.id, 'waiting')
    const before = first.get(owner, job.id), question = before.checkpoint!.frames.at(-1)!.human!.request
    first.stop()
    const second = manager(path)
    expect(second.get(owner, job.id).status).toBe('interrupted')
    second.start()
    await status(second, job.id, 'waiting')
    const restored = second.get(owner, job.id)
    expect(restored.deadline).toBe(before.deadline)
    expect(restored.checkpoint!.frames.at(-1)!.human!.request).toEqual(question)
    expect(restored.attempts).toBe(2)
    expect(restored.events.filter(event => event.kind === 'human-request')).toHaveLength(1)
    second.answer(owner, job.id, question.id, true)
    await status(second, job.id, 'succeeded')
    expect(second.get(owner, job.id).events.map(event => event.sequence)).toEqual(Array.from({ length: second.get(owner, job.id).events.length }, (_, index) => index + 1))
  })
  it('does not automatically restart foreground work, including work that had not yet left the queue', async () => {
    const path = directory(), first = manager(path)
    const job = first.submit(request(false))
    first.stop()
    const second = manager(path)
    second.start()
    expect(second.get(owner, job.id).status).toBe('interrupted')
    second.resume(owner, job.id)
    await status(second, job.id, 'waiting')
  })
  it('bounds recovery attempts across multiple service restarts', async () => {
    const path = directory()
    let service = manager(path)
    service.start()
    const job = service.submit(request())
    for (let attempt = 1; attempt <= 3; attempt++) {
      await status(service, job.id, 'waiting')
      expect(service.get(owner, job.id).attempts).toBe(attempt)
      service.stop()
      service = manager(path); service.start()
    }
    expect(service.get(owner, job.id).status).toBe('failed')
    expect(service.get(owner, job.id).message).toContain('лимит восстановления')
  })
  it('classifies an abrupt interruption from the last acknowledged running record', async () => {
    const path = directory(), first = manager(path)
    first.start()
    const job = first.submit(request())
    await status(first, job.id, 'waiting')
    const lastAcknowledged = readFileSync(join(path, `${job.id}.json`), 'utf8')
    first.stop()
    // Reproduce the on-disk image left when a process exits without stop().
    writeFileSync(join(path, `${job.id}.json`), lastAcknowledged)
    const second = manager(path)
    expect(second.get(owner, job.id).status).toBe('interrupted')
    expect(second.get(owner, job.id).message).toContain('контрольная точка')
    expect(second.get(owner, job.id).events).toEqual(JSON.parse(lastAcknowledged).events)
  })
  it('does not revive cancelled jobs or accept a late answer after restart', async () => {
    const path = directory(), first = manager(path)
    first.start()
    const job = first.submit(request())
    await status(first, job.id, 'waiting')
    const question = first.get(owner, job.id).checkpoint!.frames.at(-1)!.human!.request
    first.cancel(owner, job.id); first.stop()
    const second = manager(path); second.start()
    expect(second.get(owner, job.id).status).toBe('cancelled')
    expect(second.answer(owner, job.id, question.id, true).ok).toBe(false)
    expect(() => second.resume(owner, job.id)).toThrow('прерванному')
    expect(second.get(owner, job.id).outcome?.artifacts ?? []).toEqual([])
  })
  it('fails closed on a checkpoint quota error and retains the last committed record', async () => {
    const seed = manager(), data = request(), seedJob = seed.submit(data)
    const bytes = Buffer.byteLength(JSON.stringify(seedJob)), path = directory()
    const service = manager(path, { limits: { maxRecordBytes: bytes + 300 } })
    service.start(); service.submit(data)
    await vi.waitFor(() => expect(service.problem).toContain('сохранения'), { interval: 10 })
    expect(service.available).toBe(false)
    const raw = JSON.parse(readFileSync(join(path, `${data.id}.json`), 'utf8')) as RuntimeJob
    expect(raw.events.some(event => event.kind === 'artifact')).toBe(false)
    expect(() => service.submit(request())).toThrow('сохранения')
  })
  it('retains incompatible records for diagnosis instead of executing or overwriting them', () => {
    const path = directory(), first = manager(path), job = first.submit(request())
    first.stop()
    const raw = JSON.stringify({ ...job, recordVersion: 'future' })
    writeFileSync(join(path, `${job.id}.json`), raw)
    const second = manager(path); second.start()
    expect(second.damaged.map(item => item.id)).toEqual([job.id])
    expect(second.list(owner)).toEqual([])
    expect(readFileSync(join(path, `${job.id}.json`), 'utf8')).toBe(raw)
  })
  it('accounts for elapsed time while offline instead of granting another timeout on restart', async () => {
    const path = directory(), first = manager(path)
    first.start()
    const job = first.submit(request())
    await status(first, job.id, 'waiting')
    first.stop()
    vi.spyOn(Date, 'now').mockReturnValue(job.deadline + 1)
    const second = manager(path); second.start()
    expect(second.get(owner, job.id).status).toBe('failed')
    expect(second.get(owner, job.id).message).toContain('timeout')
  })
  it('expires a Human wait on the wake signal without waiting for a suspended OS timer', async () => {
    const service = manager(); service.start()
    const job = service.submit(request())
    await status(service, job.id, 'waiting')
    vi.spyOn(Date, 'now').mockReturnValue(job.deadline + 1)
    service.wake()
    await new Promise(resolve => setTimeout(resolve, 10))
    const result = service.get(owner, job.id)
    expect(result.status).toBe('failed')
    expect(result.outcome?.error?.message).toContain('сна ПК')
    expect(result.outcome?.artifacts).toEqual([])
  })
})
