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

import { createStore } from 'zustand/vanilla'
import { createId } from '../domain/factories'
import type { Project } from '../domain/schema'
import type { ExecutionDiagnostic } from './compiler'
import type { HumanRequest, RunArtifact, RunEvent, RunOutcome, RunStatus } from './run-types'
import { parseWorkerCommand, parseWorkerResponse, type WorkerCommand } from './protocol'
import { assertValueBudget } from './values'

export interface RunWorker {
  postMessage(message: WorkerCommand): void
  terminate(): void
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null
}
const browserWorker = (): RunWorker => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'workflow-execution' })
const active = (status: string) => ['queued', 'running', 'waiting'].includes(status)

/** Transient run state stays outside project persistence and editor undo history. */
export function createRunController(makeWorker: () => RunWorker = browserWorker) {
  const store = createStore(() => ({
    open: false, status: 'idle' as RunStatus | 'idle' | 'blocked', jobId: null as string | null,
    runId: null as string | null, planId: null as string | null, snapshot: null as Project | null,
    diagnostics: [] as ExecutionDiagnostic[], events: [] as RunEvent[], artifacts: [] as RunArtifact[],
    human: null as HumanRequest | null, outcome: null as RunOutcome | null, message: '', answerError: '',
  }))
  let worker: RunWorker | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let sequence = 0
  const release = () => { clearTimeout(watchdog); watchdog = undefined; worker?.terminate(); worker = undefined }
  const fail = (message: string) => { release(); store.setState({ status: 'failed', message, human: null }) }
  const cancel = () => {
    if (!active(store.getState().status)) return
    release()
    store.setState({ status: 'cancelled', human: null, message: 'Запуск отменён. Созданные до отмены артефакты доступны в журнале.' })
  }
  return {
    store, cancel,
    dispose: () => { cancel(); release() },
    start: (project: Project, entryNodeId: string, input: unknown) => {
      if (active(store.getState().status)) throw new Error('Сначала завершите или отмените текущий запуск.')
      release(); sequence = 0
      const jobId = createId()
      store.setState({ open: true, status: 'queued', jobId, runId: null, planId: null, snapshot: null, diagnostics: [], events: [], artifacts: [], human: null, outcome: null, message: '', answerError: '' })
      try {
        assertValueBudget(input)
        const command = parseWorkerCommand({ kind: 'start', jobId, project, entryNodeId, input })
        // Snapshot labels stay with this run even if another project is opened in the editor.
        store.setState({ snapshot: structuredClone(project) })
        worker = makeWorker()
        const current = worker
        watchdog = setTimeout(() => fail('Worker не завершил запуск за 5 минут. Выполнение остановлено.'), 310000)
        worker.onerror = event => { if (worker === current) fail(`Ошибка Worker: ${event.message || 'выполнение недоступно'}`) }
        worker.onmessageerror = () => { if (worker === current) fail('Не удалось прочитать сообщение Worker.') }
        worker.onmessage = event => {
          if (worker !== current) return
          try {
            const response = parseWorkerResponse(event.data)
            if (response.jobId !== jobId) return
            const state = store.getState()
            switch (response.kind) {
              case 'ready':
                if (state.runId) throw new Error('Повторное начало запуска.')
                store.setState({ runId: response.runId, planId: response.planId, diagnostics: response.diagnostics })
                break
              case 'rejected': release(); store.setState({ status: 'blocked', diagnostics: response.diagnostics, message: 'Исправьте конфигурацию перед запуском.' }); break
              case 'fault': fail(response.message); break
              case 'answer-result':
                if (state.human?.id === response.requestId) store.setState({ answerError: response.ok ? '' : response.message ?? 'Ответ не принят.' })
                break
              case 'event': {
                const item = response.event
                if (item.runId !== state.runId || item.sequence !== sequence + 1) throw new Error('Нарушен порядок событий запуска.')
                sequence = item.sequence
                if (sequence > 25010) throw new Error('Превышен лимит событий запуска.')
                store.setState({ events: [...state.events, item] })
                if (item.kind === 'status') store.setState({ status: item.status, ...(!active(item.status) ? { human: null } : {}) })
                if (item.kind === 'human-request') store.setState({ human: item.request, answerError: '' })
                if (item.kind === 'human-answer') store.setState({ human: null, answerError: '' })
                if (item.kind === 'artifact') store.setState({ artifacts: [...state.artifacts, item.artifact] })
                if (item.kind === 'failure') store.setState({ message: item.message })
                break
              }
              case 'complete':
                if (response.outcome.runId !== state.runId || response.outcome.planId !== state.planId || active(response.outcome.status) || response.outcome.status !== state.status) throw new Error('Некорректный итог запуска.')
                release(); store.setState({ outcome: response.outcome, human: null })
                break
            }
          } catch (error) { fail(error instanceof Error ? error.message : String(error)) }
        }
        worker.postMessage(command)
      } catch (error) { fail(error instanceof Error ? error.message : String(error)) }
    },
    answer: (requestId: string, value: unknown) => {
      const state = store.getState()
      if (!worker || state.status !== 'waiting' || state.human?.id !== requestId || !state.jobId) return
      try {
        assertValueBudget(value)
        worker.postMessage(parseWorkerCommand({ kind: 'answer', jobId: state.jobId, requestId, value }))
        store.setState({ answerError: '' })
      } catch (error) { store.setState({ answerError: error instanceof Error ? error.message : String(error) }) }
    },
  }
}
