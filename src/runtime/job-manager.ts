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
import { z } from 'zod'
import { compileProject } from '../execution/compiler'
import { ExecutionRun } from '../execution/executor'
import { parseCheckpoint, type RunCheckpoint } from '../execution/checkpoint'
import type { RunEvent, RunOutcome } from '../execution/run-types'
import { assertValueBudget } from '../execution/values'
import { graphEntries } from '../domain/graphs'
import { AtomicStore, type StoreLimits } from './atomic-store'
import { jobSchema, runtimeProfileSchema, submitJobSchema, summarizeJob, terminalJob, type JobSummary, type RuntimeJob, type SubmitJob } from './job-schema'
import { recoveryDecision } from './recovery-policy'

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
}
function fingerprint(request: Pick<SubmitJob, 'profileId' | 'project' | 'entryNodeId' | 'input' | 'background'>) {
  return createHash('sha256').update(canonical(request)).digest('hex')
}
const requestData = (job: RuntimeJob) => ({ profileId: job.profileId, project: job.plan.snapshot, entryNodeId: job.plan.entryNodeId, input: job.input, background: job.background })
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 4000)
const nowISO = () => new Date().toISOString()

/** One owner in the runtime process. Only committed snapshots reach subscribers. */
export class JobManager {
  private readonly disk: AtomicStore<RuntimeJob>
  private jobs = new Map<string, RuntimeJob>()
  private running = new Map<string, ExecutionRun>()
  private timer?: ReturnType<typeof setTimeout>
  private started = false
  private stopped = false
  private fault = ''
  readonly damaged: { id: string; message: string }[] = []
  constructor(directory: string, private readonly options: { concurrency?: number; limits?: Partial<StoreLimits>; changed?: (job: RuntimeJob) => void; unavailable?: (message: string) => void } = {}) {
    if (!Number.isInteger(options.concurrency ?? 2) || (options.concurrency ?? 2) < 1 || (options.concurrency ?? 2) > 4) throw new Error('Параллельность должна быть от 1 до 4.')
    this.disk = new AtomicStore(directory, jobSchema, options.limits)
    for (const id of this.disk.ids()) {
      try {
        const job = this.disk.read(id)
        this.verify(job, id)
        if (job.cancelRequested && !terminalJob(job)) { job.status = 'cancelled'; job.message = 'Отмена сохранена до остановки сервиса.'; this.disk.write(id, job, 'replace') }
        else if (job.status === 'running' || job.status === 'waiting' || (job.status === 'queued' && !job.background)) {
          job.status = 'interrupted'; job.message = 'Сервис был остановлен. Сохранённая контрольная точка доступна для восстановления.'
          this.disk.write(id, job, 'replace')
        }
        this.jobs.set(id, job)
      } catch (error) { this.damaged.push({ id, message: errorText(error) }) }
    }
  }
  private verify(job: RuntimeJob, id: string) {
    if (job.id !== id || fingerprint(requestData(job)) !== job.fingerprint) throw new Error('Нарушена целостность задания.')
    const compiled = compileProject(job.plan.snapshot, job.plan.entryNodeId)
    if (!compiled.ok) throw new Error('Сохранённый план больше не проходит проверку исполнения.')
    if (job.checkpoint) {
      const saved = parseCheckpoint(job.checkpoint, job.plan)
      if (saved.deadline !== job.deadline || saved.sequence !== job.events.length) throw new Error('Журнал и контрольная точка не согласованы.')
      for (let i = 0; i < job.events.length; i++) if (job.events[i]!.sequence !== i + 1 || job.events[i]!.runId !== saved.runId) throw new Error('Нарушена последовательность журнала.')
      if (job.outcome && (job.outcome.runId !== saved.runId || job.outcome.planId !== job.plan.id || job.outcome.status !== job.status)) throw new Error('Итог задания не согласован с контрольной точкой.')
    } else if (job.events.length || job.outcome) throw new Error('Журнал без контрольной точки.')
  }
  start() {
    if (this.started || this.stopped) return
    this.started = true
    try { for (const job of [...this.jobs.values()]) if (job.status === 'interrupted' && job.background) this.resume(job.profileId, job.id) }
    catch (error) { this.storageFailed(error) }
    this.schedule()
  }
  get available() { return !this.stopped && !this.fault }
  get problem() { return this.fault }
  list(profileId: string): JobSummary[] {
    runtimeProfileSchema.parse(profileId)
    return [...this.jobs.values()].filter(job => job.profileId === profileId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(summarizeJob)
  }
  get(profileId: string, id: string): RuntimeJob { return structuredClone(this.owned(profileId, id)) }
  private owned(profileId: string, id: string) {
    runtimeProfileSchema.parse(profileId); z.uuid().parse(id)
    const job = this.jobs.get(id)
    if (!job || job.profileId !== profileId) throw new Error('Задание недоступно этому профилю.')
    return job
  }
  private requireAvailable() { if (!this.available) throw new Error(this.fault || 'Сервис остановлен.') }
  private publish(job: RuntimeJob) {
    // UI disconnection must not stop a committed background task.
    try { this.options.changed?.(structuredClone(job)) } catch { /* A reconnect can fetch committed state. */ }
  }
  private commit(job: RuntimeJob, create = false) {
    this.requireAvailable()
    const next = structuredClone({ ...job, updatedAt: nowISO() })
    this.disk.write(next.id, next, create ? 'create' : 'replace')
    this.jobs.set(next.id, next)
    this.publish(next)
    return next
  }
  submit(value: unknown): RuntimeJob {
    this.requireAvailable()
    assertValueBudget(value, 20 * 1024 * 1024, true)
    const request = submitJobSchema.parse(value)
    const compiled = compileProject(request.project, request.entryNodeId)
    if (!compiled.ok) throw new Error(compiled.diagnostics.filter(item => item.severity === 'error').map(item => item.message).join('\n'))
    const data = { profileId: request.profileId, project: compiled.plan.snapshot, entryNodeId: request.entryNodeId, input: request.input, background: request.background }
    const hash = fingerprint(data)
    const duplicate = [...this.jobs.values()].find(job => job.profileId === request.profileId && job.eventKey === request.eventKey)
    if (duplicate) {
      if (duplicate.fingerprint !== hash) throw new Error('Ключ события уже использован с другим содержимым.')
      return structuredClone(duplicate)
    }
    if (this.jobs.has(request.id)) throw new Error('ID задания уже используется.')
    const timestamp = nowISO()
    const job = jobSchema.parse({ recordVersion: '0.3.1', id: request.id, profileId: request.profileId, eventKey: request.eventKey, fingerprint: hash,
      createdAt: timestamp, updatedAt: timestamp, background: request.background, plan: compiled.plan, input: request.input,
      status: 'queued', cancelRequested: false, attempts: 0, deadline: Date.now() + compiled.plan.limits.timeoutMs, retryAt: 0,
      message: '', checkpoint: null, events: [], outcome: null })
    this.commit(job, true); this.schedule()
    return structuredClone(job)
  }
  cancel(profileId: string, id: string): RuntimeJob {
    const job = this.owned(profileId, id)
    if (terminalJob(job)) return structuredClone(job)
    try {
      this.commit({ ...job, cancelRequested: true, status: 'cancelled', message: 'Запуск отменён пользователем.' })
      this.running.get(id)?.cancel()
    } catch (error) { this.storageFailed(error); throw error }
    this.schedule()
    return this.get(profileId, id)
  }
  answer(profileId: string, id: string, requestId: string, value: unknown) {
    this.requireAvailable()
    const job = this.owned(profileId, id)
    if (job.cancelRequested || job.status !== 'waiting') return { ok: false, message: 'Запрос уже закрыт.' }
    z.uuid().parse(requestId); assertValueBudget(value)
    return this.running.get(id)?.answer(requestId, value) ?? { ok: false, message: 'Сначала восстановите прерванный запуск.' }
  }
  resume(profileId: string, id: string): RuntimeJob {
    this.requireAvailable()
    const job = this.owned(profileId, id)
    if (job.status !== 'interrupted') throw new Error('Восстановление доступно только прерванному заданию.')
    // New adapters must explicitly establish recovery semantics before being retried.
    const replaySafe = new Set(['manual', 'map', 'if', 'switch', 'loop', 'merge', 'human', 'artifact', 'subworkflow'])
    const pure = graphEntries(job.plan.snapshot).every(({ graph }) => graph.nodes.every(node => node.status === 'disabled' || node.type === 'note' || (node.operation && replaySafe.has(node.operation.kind))))
    const decision = recoveryDecision({ cancelled: job.cancelRequested, now: Date.now(), deadline: job.deadline, attempts: job.attempts,
      effect: pure ? 'pure' : 'unknown', idempotencySupported: false, policy: { maxAttempts: 3, initialDelayMs: 250, maxDelayMs: 1000 } })
    if (decision.kind === 'retry') this.commit({ ...job, status: 'queued', retryAt: Date.now() + decision.delayMs, message: 'Восстановление из сохранённой контрольной точки.' })
    else if (decision.kind === 'reconcile') this.commit({ ...job, message: 'Неизвестен результат внешнего действия. Автоматический повтор запрещён; требуется сверка результата.' })
    else this.commit({ ...job, status: decision.kind === 'cancelled' ? 'cancelled' : 'failed', message: decision.kind === 'expired' ? 'Истёк общий timeout, включая время простоя.' : 'Достигнут лимит восстановления.' })
    this.schedule()
    return this.get(profileId, id)
  }
  remove(profileId: string, id: string) {
    this.requireAvailable()
    const job = this.owned(profileId, id)
    if (!terminalJob(job) || this.running.has(id)) throw new Error('Сначала завершите или отмените задание.')
    this.disk.remove(id); this.jobs.delete(id)
  }
  closeWindow() { for (const job of [...this.jobs.values()]) if (!job.background && !terminalJob(job)) this.cancel(job.profileId, job.id) }
  wake() { for (const run of this.running.values()) run.checkClock(); this.schedule() }
  /** Exit keeps resumable records; cancellation is a separate user action. */
  stop() {
    if (this.stopped) return
    clearTimeout(this.timer)
    try {
      for (const job of [...this.jobs.values()]) if (this.running.has(job.id) && !terminalJob(job)) this.commit({ ...job, status: 'interrupted', message: 'Сервис остановлен. Работа сохранена для восстановления.' })
    } finally {
      this.stopped = true
      for (const run of this.running.values()) { try { run.cancel() } catch { /* Saving is disabled after shutdown. */ } }
    }
  }
  private schedule(delay = 0) {
    if (!this.started || !this.available) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.pump(), delay)
  }
  private pump() {
    if (!this.available) return
    for (const job of [...this.jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (job.status !== 'queued' || this.running.has(job.id)) continue
      if (Date.now() >= job.deadline) {
        try { this.commit({ ...job, status: 'failed', message: 'Истёк timeout ожидания в очереди.' }) } catch (error) { this.storageFailed(error); return }
      } else if (this.running.size < (this.options.concurrency ?? 2) && Date.now() >= job.retryAt) this.launch(job)
    }
    if ([...this.jobs.values()].some(job => job.status === 'queued')) this.schedule(100)
  }
  private launch(job: RuntimeJob) {
    let events = [...job.events]
    try {
      const run = new ExecutionRun(job.plan, event => { events.push(event) }, { checkpoint: job.checkpoint ?? undefined, deadline: job.deadline, save: checkpoint => {
        const current = this.jobs.get(job.id)!
        const outcome = this.outcome(checkpoint, events)
        this.commit({ ...current, status: current.cancelRequested ? 'cancelled' : checkpoint.status, checkpoint, events, outcome })
        // Do not let a later event mutate the object already committed in memory.
        events = [...events]
      } })
      this.running.set(job.id, run)
      this.commit({ ...job, attempts: job.attempts + 1, status: 'running' })
      void run.start(job.input).catch(error => { if (!this.stopped) this.storageFailed(error) }).finally(() => { this.running.delete(job.id); this.schedule() })
    } catch (error) { this.storageFailed(error); this.running.delete(job.id) }
  }
  private outcome(checkpoint: RunCheckpoint, events: RunEvent[]): RunOutcome | null {
    if (!['succeeded', 'failed', 'cancelled'].includes(checkpoint.status)) return null
    const failure = events.findLast(event => event.kind === 'failure')
    return { runId: checkpoint.runId, planId: checkpoint.planId, status: checkpoint.status, steps: checkpoint.steps, artifacts: checkpoint.artifacts,
      ...(failure?.kind === 'failure' ? { error: { message: failure.message, ...(failure.activation ? { activation: failure.activation } : {}) } } : {}) }
  }
  private storageFailed(error: unknown) {
    if (this.fault || this.stopped) return
    this.fault = `Сервис приостановлен из-за ошибки сохранения: ${errorText(error)}`
    clearTimeout(this.timer)
    for (const run of this.running.values()) { try { run.cancel() } catch { /* Fail closed, keeping the last committed record. */ } }
    try { this.options.unavailable?.(this.fault) } catch { /* UI may have disconnected. */ }
  }
}
