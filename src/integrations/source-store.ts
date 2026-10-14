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
import { join } from 'node:path'
import { z } from 'zod'
import { AtomicStore } from '../runtime/atomic-store'
import { profileIds } from '../profiles/schema'
import { publishedWorkflowSchema, telegramBindingSchema, scheduleSchema, type PublishedWorkflow, type TelegramBinding, type Schedule } from './source-schema'
export type { TelegramBinding } from './source-schema'
import { compileProject } from '../execution/compiler'
import { assertNoObviousSecrets } from '../domain/serialization'

/** Published snapshots are immutable. Editing the Canvas never changes a remote command silently. */
export class SourceStore {
  private workflows: AtomicStore<PublishedWorkflow>
  private bindings: AtomicStore<TelegramBinding>
  private schedules: AtomicStore<Schedule>
  constructor(directory: string) {
    this.workflows = new AtomicStore(join(directory, 'workflows'), publishedWorkflowSchema, { maxRecords: 100 })
    this.bindings = new AtomicStore(join(directory, 'bindings'), telegramBindingSchema, { maxRecords: 20 })
    this.schedules = new AtomicStore(join(directory, 'schedules'), scheduleSchema, { maxRecords: 100 })
  }
  listWorkflows(profileId: string) { z.enum(profileIds).parse(profileId); return this.workflows.ids().map(id => this.workflows.read(id)).filter(item => item.profileId === profileId) }
  workflow(profileId: string, id: string) { const record = this.workflows.read(id); if (record.profileId !== profileId || !record.enabled) throw new Error('Workflow не опубликован для этого профиля.'); return record }
  publish(profileId: string, label: string, project: unknown, entryNodeId: string) {
    assertNoObviousSecrets(project)
    const compiled = compileProject(project, entryNodeId)
    if (!compiled.ok) throw new Error(compiled.diagnostics.filter(item => item.severity === 'error').map(item => item.message).join('\n'))
    const record = publishedWorkflowSchema.parse({ version: '0.5', id: randomUUID(), profileId, label, project: compiled.plan.snapshot, entryNodeId, createdAt: new Date().toISOString(), enabled: true })
    this.workflows.write(record.id, record, 'create'); return record
  }
  disableWorkflow(profileId: string, id: string) { const record = this.workflow(profileId, id); this.workflows.write(id, { ...record, enabled: false }, 'replace') }
  allBindings() { return this.bindings.ids().map(id => this.bindings.read(id)) }
  listBindings(profileId: string) { z.enum(profileIds).parse(profileId); return this.allBindings().filter(item => item.profileId === profileId) }
  binding(profileId: string, id: string) { const record = this.bindings.read(id); if (record.profileId !== profileId) throw new Error('Чат недоступен этому профилю.'); return record }
  saveBinding(value: TelegramBinding) {
    const record = telegramBindingSchema.parse(value), all = this.allBindings(), old = all.find(item => item.id === record.id)
    if (old && old.profileId !== record.profileId) throw new Error('Владелец чата не может быть изменён.')
    if (all.some(item => item.id !== record.id && item.botId === record.botId && item.userId === record.userId && item.chatId === record.chatId)) throw new Error('Этот чат уже привязан к профилю. Сначала отзовите старую привязку.')
    if (record.workflowId) this.workflow(record.profileId, record.workflowId)
    this.bindings.write(record.id, record, old ? 'replace' : 'create'); return record
  }
  removeBinding(profileId: string, id: string) { this.binding(profileId, id); this.bindings.remove(id) }
  allSchedules() { return this.schedules.ids().map(id => this.schedules.read(id)) }
  saveSchedule(value: Schedule) { const record = scheduleSchema.parse(value); this.workflow(record.profileId, record.workflowId); assertNoObviousSecrets(record.input); this.schedules.write(record.id, record, 'create'); return record }
  advanceSchedule(record: Schedule, nextAt: number) { this.schedules.write(record.id, { ...record, nextAt }, 'replace') }
  removeSchedule(profileId: string, id: string) { const record = this.schedules.read(id); if (record.profileId !== profileId) throw new Error('Расписание недоступно.'); this.schedules.remove(id) }
}
