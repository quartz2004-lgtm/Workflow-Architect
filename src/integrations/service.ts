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
import { IntegrationConnections } from './connection-store'
import { EffectStore } from './effect-store'
import { FilesystemMcp } from './mcp'
import { IntegrationBroker } from './broker'
import { SourceStore } from './source-store'
import { TelegramInbox } from './telegram-inbox'
import { TelegramHub } from './telegram-hub'
import { integrationCommandSchema } from './protocol'
import { scopedUrl } from './network'
import { ScopedFiles } from './files'
import type { JobManager } from '../runtime/job-manager'
import type { ConnectionStore } from '../ai/connection-store'
import type { IntegrationConnection } from './schema'

export class IntegrationService {
  readonly connections: IntegrationConnections
  readonly broker: IntegrationBroker
  readonly sources: SourceStore
  readonly telegram: TelegramHub
  private timer?: ReturnType<typeof setInterval>
  private scheduleProblems = new Map<string, string>()
  constructor(directory: string, filesystemEntry: string, resolveSecret: (profileId: string, id: string) => Promise<string>, private readonly jobs: JobManager, models: ConnectionStore) {
    this.connections = new IntegrationConnections(join(directory, 'connections'))
    this.broker = new IntegrationBroker(this.connections, new EffectStore(join(directory, 'effects')), new FilesystemMcp(filesystemEntry), resolveSecret)
    this.sources = new SourceStore(join(directory, 'sources'))
    this.telegram = new TelegramHub(this.broker, this.sources, new TelegramInbox(join(directory, 'telegram')), jobs, profileId => {
      const model = models.state(profileId).connection?.configuration.model
      if (!model) throw new Error('Подключите локальную модель для распознавания сообщений. Команды /run, /edit, /status доступны без распознавания.')
      return { model, provider: models.resolve(profileId, model) }
    })
  }
  start() { this.telegram.start(); this.timer = setInterval(() => this.tick(), 1000) }
  stop() { clearInterval(this.timer); this.telegram.stop(); this.connections.stop() }
  private validate(record: IntegrationConnection) {
    const settings = record.settings
    if (settings.kind === 'http-json') scopedUrl(settings.baseUrl, '', {})
    if (settings.kind === 'local-files' || settings.kind === 'mcp-filesystem') new ScopedFiles(settings.root, false)
  }
  private tick() {
    try {
      for (const schedule of this.sources.allSchedules()) {
        if (!schedule.enabled || schedule.nextAt > Date.now()) continue
        try {
          const workflow = this.sources.workflow(schedule.profileId, schedule.workflowId)
          const slot = schedule.nextAt
          this.jobs.submit({ id: randomUUID(), profileId: schedule.profileId, eventKey: `schedule:${schedule.id}:${slot}`, project: workflow.project, entryNodeId: workflow.entryNodeId, input: schedule.input, background: true })
          // At most one catch-up after sleep, never a burst for every missed interval.
          this.sources.advanceSchedule(schedule, slot + (Math.floor((Date.now() - slot) / (schedule.intervalMinutes * 60000)) + 1) * schedule.intervalMinutes * 60000)
          this.scheduleProblems.delete(schedule.id)
        } catch (error) { this.scheduleProblems.set(schedule.id, this.broker.redactor.redact(error instanceof Error ? error.message : 'Ошибка расписания.')) }
      }
    } catch { /* Damaged source data is shown when the settings are opened; do not start unknown work. */ }
  }
  async handle(value: unknown): Promise<unknown> {
    const command = integrationCommandSchema.parse(value)
    switch (command.action) {
      case 'list': return {
        connections: this.connections.list(command.profileId), damaged: this.connections.damaged,
        workflows: this.sources.listWorkflows(command.profileId).map(record => ({ id: record.id, profileId: record.profileId, version: record.version, label: record.label, createdAt: record.createdAt, entryNodeId: record.entryNodeId, enabled: record.enabled })),
        schedules: this.sources.allSchedules().filter(item => item.profileId === command.profileId).map(item => ({ ...item, problem: this.scheduleProblems.get(item.id) ?? '' })),
        telegram: this.telegram.status(command.profileId), effects: this.broker.effects.listUnknown(command.profileId),
      }
      case 'save': this.validate(command.connection); { const saved = this.connections.save(command.connection); this.telegram.refresh(); return saved }
      case 'remove': this.connections.remove(command.profileId, command.id); return null
      case 'check': {
        const { connection, signal } = this.connections.capture(command.profileId, command.id)
        this.validate(connection)
        if (connection.settings.kind === 'telegram') return this.broker.telegram(command.profileId, command.id).api.me(signal)
        if (connection.settings.kind === 'mcp-filesystem') return { tools: await this.broker.mcp.discover(connection.settings, signal) }
        if (connection.settings.kind === 'local-files') return new ScopedFiles(connection.settings.root, false).list()
        return this.broker.execute(command.profileId, command.id, `check:${randomUUID()}`, 'http.request', { method: 'GET', path: '', query: {} }, signal)
      }
      case 'pair': return this.telegram.pair(command.profileId, command.id)
      case 'publish': return this.sources.publish(command.profileId, command.label, command.project, command.entryNodeId)
      case 'disable-workflow': this.sources.disableWorkflow(command.profileId, command.id); return null
      case 'select-workflow': return this.sources.saveBinding({ ...this.sources.binding(command.profileId, command.bindingId), workflowId: command.workflowId })
      case 'remove-binding': this.sources.removeBinding(command.profileId, command.id); return null
      case 'schedule': return this.sources.saveSchedule({ version: '0.5', id: randomUUID(), profileId: command.profileId, workflowId: command.workflowId, intervalMinutes: command.intervalMinutes, input: command.input, enabled: true, nextAt: Date.now() + command.intervalMinutes * 60000 })
      case 'remove-schedule': this.sources.removeSchedule(command.profileId, command.id); return null
    }
  }
}
