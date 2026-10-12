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
import type { Project } from '../domain/schema'
import type { ExecutionDiagnostic } from './compiler'
import type { HumanRequest, RunArtifact, RunEvent, RunOutcome, RunStatus } from './run-types'
import type { NativeRunControls } from './desktop-controller'

export const runStatusLabels = { idle: 'Готов к запуску', queued: 'В очереди', running: 'Выполняется', waiting: 'Нужен ваш ответ', succeeded: 'Завершён', failed: 'Ошибка', cancelled: 'Отменён', blocked: 'Запуск заблокирован', interrupted: 'Запуск прерван', unknown: 'Статус не подтверждён' }

export interface RunViewState {
  open: boolean
  status: RunStatus | 'idle' | 'blocked' | 'interrupted' | 'unknown'
  jobId: string | null; runId: string | null; planId: string | null; snapshot: Project | null
  diagnostics: ExecutionDiagnostic[]; events: RunEvent[]; artifacts: RunArtifact[]
  human: HumanRequest | null; outcome: RunOutcome | null; message: string; answerError: string
  available: boolean; actionPending: boolean; backgroundAllowed: boolean
}
export function emptyRunView(): RunViewState {
  return { open: false, status: 'idle', jobId: null, runId: null, planId: null, snapshot: null,
    diagnostics: [], events: [], artifacts: [], human: null, outcome: null, message: '', answerError: '',
    available: true, actionPending: false, backgroundAllowed: false }
}
export const createRunViewStore = () => createStore<RunViewState>(() => emptyRunView())
export interface RunController {
  store: StoreApi<RunViewState>
  native?: NativeRunControls
  connect(): void
  dispose(): void
  start(project: Project, entryNodeId: string, input: unknown): void
  cancel(): void
  answer(requestId: string, value: unknown): void
}
