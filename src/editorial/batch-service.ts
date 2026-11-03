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

import { createHash } from 'node:crypto'
import { AtomicStore } from '../runtime/atomic-store'
import type { JobManager } from '../runtime/job-manager'
import { compileProject } from '../execution/compiler'
import { batchCommandSchema, batchRequestSchema, editorialBatchSchema, batchView, type EditorialBatch } from './batch-schema'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** A batch is a durable delivery manifest. Each item is an ordinary independent runtime job. */
export class EditorialBatchService {
  private readonly disk: AtomicStore<EditorialBatch>
  constructor(directory: string, private readonly jobs: JobManager) {
    this.disk = new AtomicStore(directory, editorialBatchSchema, { maxRecords: 100, maxRecordBytes: 24 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 })
  }
  private read(profileId: string, id: string) {
    const value = this.disk.read(id)
    if (value.request.profileId !== profileId) throw new Error('Очередь недоступна этому профилю.')
    if (value.request.id !== id || hash(value.request) !== value.fingerprint || value.items.length !== value.request.items.length || value.items.some((item, index) => item.id !== value.request.items[index]!.id)) throw new Error('Очередь повреждена; повторная отправка запрещена.')
    return value
  }
  handle(raw: unknown) {
    const command = batchCommandSchema.parse(raw)
    if (command.action === 'submit') return batchView(this.submit(command.request))
    if (command.action === 'list') return this.disk.ids().filter(id => this.disk.read(id).request.profileId === command.profileId).map(id => batchView(this.read(command.profileId, id)))
    const batch = this.read(command.profileId, command.id)
    if (command.action === 'cancel') {
      batch.cancelled = true
      this.disk.write(batch.request.id, batch, 'replace')
      // Also reconcile a crash between job submission and manifest update.
      const known = this.jobs.list(command.profileId)
      for (const item of batch.items) if (known.some(job => job.id === item.id) && this.jobs.get(command.profileId, item.id).eventKey === `batch:${batch.request.id}:${item.id}`) this.jobs.cancel(command.profileId, item.id)
      return batchView(batch)
    }
    return batchView(this.dispatch(batch))
  }
  submit(raw: unknown) {
    const request = batchRequestSchema.parse(raw)
    if (this.disk.ids().includes(request.id)) {
      const previous = this.read(request.profileId, request.id)
      if (previous.fingerprint !== hash(request)) throw new Error('Эта очередь уже сохранена с другим содержимым.')
      return this.dispatch(previous)
    }
    const compiled = compileProject(request.project, request.entryNodeId)
    if (!compiled.ok) throw new Error(compiled.diagnostics.filter(item => item.severity === 'error').map(item => item.message).join('\n'))
    const entry = request.project.nodes.find(node => node.id === request.entryNodeId)
    const editorial = request.project.nodes.some(node => node.operation?.kind === 'agent' && node.operation.editorial && request.project.edges.some(edge => edge.type === 'flow' && edge.sourceNode === request.entryNodeId && edge.targetNode === node.id))
    if (entry?.operation?.kind !== 'manual' || !editorial) throw new Error('Для очереди выберите ручной вход, соединённый с редакционным Agent.')
    const batch = editorialBatchSchema.parse({ schemaVersion: '0.5.5', request, fingerprint: hash(request), createdAt: new Date().toISOString(), cancelled: false, items: request.items.map(item => ({ id: item.id, submitted: false, error: '' })) })
    this.disk.write(request.id, batch, 'create')
    return this.dispatch(batch)
  }
  private dispatch(batch: EditorialBatch) {
    if (batch.cancelled) return batch
    for (const [index, item] of batch.items.entries()) {
      if (item.submitted) continue
      const task = batch.request.items[index]!.task
      const project = structuredClone(batch.request.project)
      project.project.name = `${project.project.name.slice(0, 70)} · ${index + 1}. ${task.text.slice(0, 60)}`
      try {
        this.jobs.submit({ id: item.id, eventKey: `batch:${batch.request.id}:${item.id}`, profileId: batch.request.profileId,
          project, entryNodeId: batch.request.entryNodeId, input: task, background: batch.request.background })
        item.submitted = true; item.error = ''
      } catch (error) { item.error = (error instanceof Error ? error.message : 'Не удалось поставить материал в очередь.').slice(0, 4000) }
      this.disk.write(batch.request.id, batch, 'replace')
    }
    return structuredClone(batch)
  }
}
