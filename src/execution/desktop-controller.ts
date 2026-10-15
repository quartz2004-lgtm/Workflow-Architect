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

import { createStore, type StoreApi } from 'zustand/vanilla'
import { z } from 'zod'
import { createId } from '../domain/factories'
import { jobSchema, jobSummarySchema, runtimeProfileSchema, type JobSummary, type SubmitJob } from '../runtime/job-schema'
import { runtimeCommandSchema, type RuntimeCommand } from '../runtime/service-protocol'
import { compileProject } from './compiler'
import { assertValueBudget } from './values'
import { createRunViewStore, emptyRunView, type RunController } from './view-state'

export interface RuntimeBridge {
  request(command: unknown): Promise<unknown>
  state(): Promise<unknown>
  reconnect(): Promise<unknown>
  subscribe(listener: (message: unknown) => void): () => void
}
const serviceSchema = z.strictObject({ status: z.enum(['starting', 'ready', 'unavailable', 'stopped']), message: z.string().max(4000), pid: z.number().int().positive().optional(), damaged: z.array(z.strictObject({ id: z.string(), message: z.string() })).max(500) })
type ServiceState = z.infer<typeof serviceSchema>
interface NativeViewState { service: ServiceState; jobs: JobSummary[]; background: boolean; error: string; pendingSubmission: boolean }
export interface NativeRunControls {
  store: StoreApi<NativeViewState>
  refresh(): void; reconnect(): void; select(id: string): void; resume(): void; remove(): void; newRun(): void; retrySubmission(): void
}
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')

/** Renderer-side projection only. Execution and authoritative state belong to the service. */
export function createDesktopRunController(bridge: RuntimeBridge, profile: string): RunController {
  const profileId = runtimeProfileSchema.parse(profile)
  const store = createRunViewStore()
  store.setState({ available: false })
  const nativeStore = createStore<NativeViewState>(() => ({ service: { status: 'starting', message: '', damaged: [] }, jobs: [], background: false, error: '', pendingSubmission: false }))
  let connected = false, generation = 0, selection = 0, initialized = false, refreshing = false, again = false
  let unsubscribe: (() => void) | undefined, unsubscribeView: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined
  let submission: SubmitJob | undefined
  const request = (command: RuntimeCommand) => bridge.request(runtimeCommandSchema.parse(command))
  const apply = (raw: unknown, expected: string) => {
    assertValueBudget(raw, 128 * 1024 * 1024, true)
    const job = jobSchema.parse(raw)
    if (job.id !== expected || job.profileId !== profileId) throw new Error('Получено задание другого профиля или запроса.')
    const pending = job.checkpoint?.frames.at(-1)?.human
    store.setState({ jobId: job.id, status: job.status, runId: job.checkpoint?.runId ?? null, planId: job.plan.id, snapshot: job.plan.snapshot,
      events: job.events, artifacts: job.outcome?.artifacts ?? job.checkpoint?.artifacts ?? [], outcome: job.outcome,
      human: job.status === 'waiting' && pending && !pending.answer ? pending.request : null, backgroundAllowed: job.background,
      message: job.outcome?.error?.message || job.message, answerError: pending?.request.id === store.getState().human?.id ? store.getState().answerError : '' })
    if (submission?.id === job.id) { submission = undefined; nativeStore.setState({ pendingSubmission: false }) }
  }
  const schedule = () => {
    if (connected && !timer) timer = setTimeout(() => { timer = undefined; void refresh() }, 150)
  }
  async function refresh() {
    if (!connected) return
    if (refreshing) { again = true; return }
    refreshing = true
    const epoch = generation
    try {
      const service = serviceSchema.parse(await bridge.state())
      if (!connected || epoch !== generation) return
      nativeStore.setState({ service }); store.setState({ available: service.status === 'ready' })
      if (service.status !== 'ready') return
      const jobs = z.array(jobSummarySchema).max(500).parse(await request({ kind: 'list', profileId }))
      if (!connected || epoch !== generation) return
      if (jobs.some(job => job.profileId !== profileId)) throw new Error('История другого профиля отклонена.')
      nativeStore.setState({ jobs })
      if (!initialized) {
        initialized = true
        if (!store.getState().jobId) store.setState({ jobId: jobs.find(job => ['running', 'waiting', 'queued', 'interrupted'].includes(job.status))?.id ?? jobs[0]?.id ?? null })
      }
      const id = store.getState().jobId, selected = selection, summary = jobs.find(job => job.id === id)
      if (summary && !store.getState().open) store.setState({ status: summary.status, backgroundAllowed: summary.background, ...(summary.status !== 'waiting' ? { human: null } : {}) })
      if (id && summary && store.getState().open) {
        const job = await request({ kind: 'get', profileId, id })
        if (connected && epoch === generation && selected === selection && store.getState().jobId === id) apply(job, id)
      }
    } catch (error) { if (connected && epoch === generation) nativeStore.setState({ error: errorText(error) }) }
    finally { refreshing = false; if (again) { again = false; schedule() } }
  }
  function action(work: () => Promise<void>) {
    if (!connected || store.getState().actionPending) return
    const epoch = generation
    store.setState({ actionPending: true }); nativeStore.setState({ error: '' })
    void work().catch(error => { if (connected && epoch === generation) nativeStore.setState({ error: errorText(error) }) })
      .finally(() => { if (connected && epoch === generation) { store.setState({ actionPending: false }); schedule() } })
  }
  const selectedCommand = (kind: 'cancel' | 'resume' | 'remove') => action(async () => {
    const id = store.getState().jobId, epoch = generation, selected = selection
    if (!id) return
    const raw = await request({ kind, profileId, id })
    if (!connected || epoch !== generation || selected !== selection) return
    selection++
    if (kind === 'remove') { store.setState({ ...emptyRunView(), open: true }); initialized = true }
    else apply(raw, id)
  })
  const sendSubmission = () => action(async () => {
    if (!submission) return
    const sent = submission, epoch = generation, selected = selection
    try {
      const raw = await request({ kind: 'submit', request: sent })
      if (connected && epoch === generation && selected === selection) { selection++; apply(raw, sent.id) }
    } catch (error) {
      if (connected && epoch === generation && selected === selection) store.setState({ status: 'unknown', message: 'Отправка не подтверждена. Обновите историю или повторите отправку с тем же ключом.' })
      throw error
    }
  })
  const native: NativeRunControls = {
    store: nativeStore, refresh: () => { nativeStore.setState({ error: '' }); void refresh() },
    reconnect: () => action(async () => {
      // A ready service has not necessarily restored the selected Human checkpoint yet.
      // Invalidate an in-flight projection and require a fresh job before enabling answers.
      selection++; store.setState({ human: null, available: false })
      await bridge.reconnect(); await refresh()
    }),
    select: id => { if (!store.getState().actionPending) { selection++; store.setState({ ...emptyRunView(), open: true, jobId: id, available: nativeStore.getState().service.status === 'ready' }); void refresh() } },
    resume: () => selectedCommand('resume'), remove: () => selectedCommand('remove'), retrySubmission: sendSubmission,
    newRun: () => {
      if (store.getState().actionPending) return
      selection++; initialized = true; submission = undefined
      store.setState({ ...emptyRunView(), open: true, available: nativeStore.getState().service.status === 'ready' })
      nativeStore.setState({ background: false, error: '', pendingSubmission: false })
    },
  }
  return {
    store, native,
    connect: () => {
      if (connected) return
      connected = true; generation++; store.setState({ actionPending: false })
      unsubscribeView = store.subscribe((state, previous) => { if (state.open && !previous.open) schedule() })
      unsubscribe = bridge.subscribe(message => {
        if (!message || typeof message !== 'object' || !('kind' in message)) return
        if (message.kind === 'service') { void refresh() }
        else if (message.kind === 'changed' && 'profileId' in message && message.profileId === profileId) schedule()
      })
      void refresh()
    },
    dispose: () => { connected = false; generation++; selection++; clearTimeout(timer); timer = undefined; unsubscribe?.(); unsubscribe = undefined; unsubscribeView?.(); unsubscribeView = undefined },
    cancel: () => selectedCommand('cancel'),
    start: (project, entryNodeId, input) => {
      if (!connected || !store.getState().available || store.getState().actionPending) return
      assertValueBudget(input)
      const compiled = compileProject(project, entryNodeId)
      selection++; initialized = true
      if (!compiled.ok) { store.setState({ ...emptyRunView(), open: true, status: 'blocked', snapshot: structuredClone(project), diagnostics: compiled.diagnostics }); return }
      const id = createId()
      const command = runtimeCommandSchema.parse({ kind: 'submit', request: { id, profileId, eventKey: id, project, entryNodeId, input, background: nativeStore.getState().background } })
      if (command.kind !== 'submit') return
      submission = command.request
      nativeStore.setState({ pendingSubmission: true })
      store.setState({ ...emptyRunView(), open: true, status: 'queued', jobId: id, snapshot: compiled.plan.snapshot, diagnostics: compiled.diagnostics, backgroundAllowed: command.request.background })
      sendSubmission()
    },
    answer: (requestId, value) => action(async () => {
      assertValueBudget(value)
      const id = store.getState().jobId, epoch = generation, selected = selection
      if (!id) return
      const result = z.strictObject({ ok: z.boolean(), message: z.string().optional() }).parse(await request({ kind: 'answer', profileId, id, requestId, value }))
      if (connected && epoch === generation && selected === selection) {
        if (result.ok) { selection++; store.setState({ human: null, answerError: '' }) }
        else store.setState({ answerError: result.message ?? 'Ответ не принят.' })
      }
    }),
  }
}
