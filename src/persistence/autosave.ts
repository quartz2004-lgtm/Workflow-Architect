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
import type { Editor } from '../editor/session'
import type { ProjectRepository } from './repository'
import { conflictCopy, ProjectConflictError } from './conflicts'
import type { Project } from '../domain/schema'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'
export function startAutosave(editor: Editor, repository: ProjectRepository, delay = 450) {
  const statusStore = createStore(() => ({ status: 'unsaved' as SaveStatus, error: null as string | null, conflict: false }))
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined
  let savedRevision = -1
  let stopped = false
  const flush = async (): Promise<void> => {
    clearTimeout(timer)
    if (running) { await running; if (!stopped && savedRevision !== editor.projectStore.getState().revision && statusStore.getState().status !== 'error') await flush(); return }
    if (stopped || savedRevision === editor.projectStore.getState().revision) return
    const { project, revision } = editor.projectStore.getState()
    statusStore.setState({ status: 'saving', error: null, conflict: false })
    running = (async () => {
      try {
        await repository.save(project)
        savedRevision = revision
        statusStore.setState({ status: editor.projectStore.getState().revision === revision ? 'saved' : 'unsaved' })
      } catch (error) {
        statusStore.setState({ status: 'error', error: error instanceof Error ? error.message : 'Ошибка сохранения', conflict: error instanceof ProjectConflictError })
      }
    })()
    await running
    running = undefined
    if (!stopped && statusStore.getState().status === 'unsaved') await flush()
  }
  const schedule = () => {
    if (!statusStore.getState().conflict) statusStore.setState({ status: 'unsaved', error: null })
    clearTimeout(timer)
    timer = setTimeout(() => { void flush() }, delay)
  }
  const unsubscribe = editor.projectStore.subscribe(schedule)
  schedule()
  const adopt = async (project: Project) => { await repository.adopt?.(project) }
  const saveAsCopy = async () => {
    if (running) await running
    const revision = editor.projectStore.getState().revision
    const copy = conflictCopy(editor.projectStore.getState().project)
    // Persist first: a quota failure must not replace the current project or its history.
    await repository.save(copy)
    if (editor.projectStore.getState().revision !== revision) throw new Error('Копия сохранена, но во время записи появились новые правки. Они остаются в редакторе; сохраните ещё одну копию.')
    editor.replaceProject(copy)
    savedRevision = editor.projectStore.getState().revision
    clearTimeout(timer)
    statusStore.setState({ status: 'saved', error: null, conflict: false })
  }
  return { statusStore, flush, adopt, saveAsCopy, stop: () => { stopped = true; clearTimeout(timer); unsubscribe() } }
}
export type Autosave = ReturnType<typeof startAutosave>
