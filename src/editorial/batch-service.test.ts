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
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { EditorialBatchService } from './batch-service'
import { JobManager } from '../runtime/job-manager'
import { EditorialProcessService } from './process-service'
import { createEditorialExample } from '../execution/editorial-example'
import { defaultAgentKnowledge } from '../domain/knowledge-config'
import { profileIds } from '../profiles/schema'
import { taskFromForm } from './task-form'
import type { RuntimeKnowledge } from '../knowledge/runtime'

const roots: string[] = [], managers: JobManager[] = []
afterEach(() => {
  managers.splice(0).forEach(manager => manager.stop())
  for (const root of roots.splice(0)) {
    const local = relative(tmpdir(), root)
    if (!local.startsWith('wa-batch-') || /[/\\]/.test(local) || local.includes('..')) throw new Error('Unsafe cleanup')
    rmSync(root, { recursive: true, force: true })
  }
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wa-batch-')); roots.push(root)
  const knowledge: RuntimeKnowledge = {
    prepare: vi.fn<RuntimeKnowledge['prepare']>((profileId, runId, snapshot, input) => snapshot.nodes.filter(node => node.operation?.kind === 'agent').map(node => ({ nodeId: node.id, collectionIds: [], packet: { schemaVersion: '0.5.3', profileId: profileId as typeof profileIds[number], runId, task: JSON.stringify(input), query: 'Test', excerpts: [], gaps: [], budgetBytes: 16000 } }))),
    resolve: (_profile, _run, packets, nodeId) => packets.find(packet => packet.nodeId === nodeId)!.packet,
  }
  const jobs = new JobManager(join(root, 'jobs'), { knowledge, editorialProcess: new EditorialProcessService(join(root, 'process')) }); managers.push(jobs)
  const project = createEditorialExample('fixture', { ...defaultAgentKnowledge, collections: [{ collectionId: crypto.randomUUID() }] })
  const request = { id: crypto.randomUUID(), profileId: profileIds[0], project, entryNodeId: project.nodes.find(node => node.operation?.kind === 'manual')!.id, background: true,
    items: Array.from({ length: 10 }, (_, i) => ({ id: crypto.randomUUID(), task: taskFromForm({ kind: 'article', text: `Тема ${i + 1}`, audience: 'Общая', minimumWords: 600, items: 5, previousArticle: '' }) })),
  }
  return { root, jobs, knowledge, request, service: new EditorialBatchService(join(root, 'batches'), jobs) }
}
describe('independent durable editorial batches', () => {
  it('queues ten separately frozen tasks and deduplicates resubmission after manifest recovery', () => {
    const f = fixture(), batch = f.service.submit(f.request)
    expect(batch.items.every(item => item.submitted)).toBe(true)
    expect(f.jobs.list(profileIds[0])).toHaveLength(10)
    for (const [i, item] of f.request.items.entries()) {
      const job = f.jobs.get(profileIds[0], item.id)
      expect(job.input).toEqual(item.task)
      expect(job.preparedKnowledge![0]!.packet.runId).toBe(item.id)
      expect(job.preparedKnowledge![0]!.packet.task).toContain(`Тема ${i + 1}`)
      expect(job.executionStartedAt).toBeNull()
    }
    expect(f.knowledge.prepare).toHaveBeenCalledTimes(10)
    // Simulate a crash after submit but before acknowledging that item in the manifest.
    const path = join(f.root, 'batches', `${f.request.id}.json`)
    const saved = JSON.parse(readFileSync(path, 'utf8')); saved.items[0].submitted = false
    writeFileSync(path, JSON.stringify(saved))
    new EditorialBatchService(join(f.root, 'batches'), f.jobs).submit(f.request)
    expect(f.jobs.list(profileIds[0])).toHaveLength(10)
    expect(f.knowledge.prepare).toHaveBeenCalledTimes(10)
    expect(() => f.service.submit({ ...f.request, background: false })).toThrow('другим содержимым')
    expect(f.service.handle({ action: 'list', profileId: profileIds[1] })).toEqual([])
  })
  it('retains partial acceptance and retries only the unsubmitted item', () => {
    const f = fixture(), prepare = f.knowledge.prepare
    vi.mocked(f.knowledge.prepare).mockImplementationOnce(() => { throw new Error('Source unavailable') })
    const batch = f.service.submit(f.request)
    expect(batch.items[0]).toMatchObject({ submitted: false, error: 'Source unavailable' })
    expect(f.jobs.list(profileIds[0])).toHaveLength(9)
    f.service.handle({ action: 'retry', profileId: profileIds[0], id: batch.request.id })
    expect(f.jobs.list(profileIds[0])).toHaveLength(10)
    expect(prepare).toHaveBeenCalledTimes(11)
  })
  it('cancels only this batch and never creates more work after cancellation', () => {
    const f = fixture(), batch = f.service.submit(f.request)
    expect(() => f.service.handle({ action: 'cancel', profileId: profileIds[1], id: batch.request.id })).toThrow('профилю')
    f.service.handle({ action: 'cancel', profileId: profileIds[0], id: batch.request.id })
    expect(f.jobs.list(profileIds[0]).every(job => job.status === 'cancelled')).toBe(true)
    f.service.submit(f.request)
    expect(f.knowledge.prepare).toHaveBeenCalledTimes(10)
    expect(f.jobs.list(profileIds[0])).toHaveLength(10)
  })
  it('rejects non-editorial entry and more than ten tasks before creating jobs', () => {
    const f = fixture()
    expect(() => f.service.submit({ ...f.request, items: [...f.request.items, { ...f.request.items[0], id: crypto.randomUUID() }] })).toThrow()
    expect(() => f.service.submit({ ...f.request, entryNodeId: f.request.project.nodes.find(node => node.operation?.kind === 'telegram-message')!.id })).toThrow('ручной вход')
    expect(f.jobs.list(profileIds[0])).toEqual([])
  })
})
