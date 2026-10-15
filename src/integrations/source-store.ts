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
import { checkTelegramWorkflow } from './telegram-preflight'

const dialogueSchema = z.strictObject({
  version: z.literal('0.5.1'), id: z.uuid(), profileId: z.enum(profileIds),
  mode: z.enum(['create', 'edit']), promptUpdateId: z.number().int().nonnegative(),
  workflowId: z.uuid(), previousJobId: z.uuid().nullable(), expiresAt: z.number().int().positive(),
})
type Dialogue = z.infer<typeof dialogueSchema>

/** Published snapshots are immutable. Editing the Canvas never changes a remote command silently. */
export class SourceStore {
  private workflows: AtomicStore<PublishedWorkflow>
  private bindings: AtomicStore<TelegramBinding>
  private schedules: AtomicStore<Schedule>
  private dialogues: AtomicStore<Dialogue>
  constructor(directory: string) {
    this.workflows = new AtomicStore(join(directory, 'workflows'), publishedWorkflowSchema, { maxRecords: 100 })
    this.bindings = new AtomicStore(join(directory, 'bindings'), telegramBindingSchema, { maxRecords: 20 })
    this.schedules = new AtomicStore(join(directory, 'schedules'), scheduleSchema, { maxRecords: 100 })
    this.dialogues = new AtomicStore(join(directory, 'telegram-dialogues'), dialogueSchema, { maxRecords: 20 })
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
  selectWorkflow(profileId: string, bindingId: string, workflowId: string | null, expectedWorkflowId?: string | null) {
    const binding = this.binding(profileId, bindingId)
    if (expectedWorkflowId !== undefined && binding.workflowId !== expectedWorkflowId) throw new Error('Сценарий чата уже изменён. Обновите окно и повторите выбор.')
    if (workflowId) {
      const workflow = this.workflow(profileId, workflowId), check = checkTelegramWorkflow(workflow.project, workflow.entryNodeId)
      if (!check.ok) throw new Error(check.errors.join('\n'))
    }
    return this.saveBinding({ ...binding, workflowId })
  }
  activate(profileId: string, bindingId: string, expectedWorkflowId: string | null, label: string, project: unknown, entryNodeId: string) {
    const binding = this.binding(profileId, bindingId)
    if (binding.workflowId !== expectedWorkflowId) throw new Error('Сценарий чата уже изменён. Обновите окно и повторите выбор.')
    const check = checkTelegramWorkflow(project, entryNodeId)
    if (!check.ok) throw new Error(check.errors.join('\n'))
    const workflow = this.publish(profileId, label, project, entryNodeId)
    // Snapshot first, pointer last: a failed write leaves the old chat assignment intact.
    return { workflow, binding: this.saveBinding({ ...binding, workflowId: workflow.id }) }
  }
  saveBinding(value: TelegramBinding) {
    const record = telegramBindingSchema.parse(value), all = this.allBindings(), old = all.find(item => item.id === record.id)
    if (old && old.profileId !== record.profileId) throw new Error('Владелец чата не может быть изменён.')
    if (all.some(item => item.id !== record.id && item.botId === record.botId && item.userId === record.userId && item.chatId === record.chatId)) throw new Error('Этот чат уже привязан к профилю. Сначала отзовите старую привязку.')
    if (record.workflowId) this.workflow(record.profileId, record.workflowId)
    this.bindings.write(record.id, record, old ? 'replace' : 'create'); return record
  }
  recordJob(profileId: string, bindingId: string, jobId: string) {
    const current = this.binding(profileId, bindingId)
    const record = telegramBindingSchema.parse({ ...current, lastJobId: jobId })
    this.bindings.write(bindingId, record, 'replace'); return record
  }
  dialogue(profileId: string, bindingId: string) {
    this.binding(profileId, bindingId)
    if (!this.dialogues.ids().includes(bindingId)) return null
    const record = this.dialogues.read(bindingId)
    if (record.profileId !== profileId) throw new Error('Диалог недоступен этому профилю.')
    return record
  }
  beginDialogue(profileId: string, bindingId: string, mode: Dialogue['mode'], promptUpdateId: number) {
    const binding = this.binding(profileId, bindingId), old = this.dialogue(profileId, bindingId)
    if (old?.promptUpdateId === promptUpdateId) return old
    if (!binding.workflowId) throw new Error('Включите сценарий для этого чата в приложении: Интеграции → Telegram.')
    this.workflow(profileId, binding.workflowId)
    const record = dialogueSchema.parse({ version: '0.5.1', id: bindingId, profileId, mode, promptUpdateId, workflowId: binding.workflowId, previousJobId: binding.lastJobId, expiresAt: Date.now() + 10 * 60 * 1000 })
    this.dialogues.write(bindingId, record, old ? 'replace' : 'create'); return record
  }
  consumeDialogue(profileId: string, bindingId: string, promptUpdateId?: number) {
    const record = this.dialogue(profileId, bindingId)
    if (record && (promptUpdateId === undefined || record.promptUpdateId === promptUpdateId)) this.dialogues.remove(bindingId)
  }
  removeBinding(profileId: string, id: string) { this.consumeDialogue(profileId, id); this.bindings.remove(id) }
  allSchedules() { return this.schedules.ids().map(id => this.schedules.read(id)) }
  saveSchedule(value: Schedule) { const record = scheduleSchema.parse(value); this.workflow(record.profileId, record.workflowId); assertNoObviousSecrets(record.input); this.schedules.write(record.id, record, 'create'); return record }
  advanceSchedule(record: Schedule, nextAt: number) { this.schedules.write(record.id, { ...record, nextAt }, 'replace') }
  removeSchedule(profileId: string, id: string) { const record = this.schedules.read(id); if (record.profileId !== profileId) throw new Error('Расписание недоступно.'); this.schedules.remove(id) }
}
