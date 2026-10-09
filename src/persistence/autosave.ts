import { createStore } from 'zustand/vanilla'
import type { Editor } from '../editor/session'
import type { ProjectRepository } from './repository'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'
export function startAutosave(editor: Editor, repository: ProjectRepository, delay = 450) {
  const statusStore = createStore(() => ({ status: 'unsaved' as SaveStatus, error: null as string | null }))
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined
  let savedRevision = -1
  let stopped = false
  const flush = async (): Promise<void> => {
    clearTimeout(timer)
    if (running) { await running; if (!stopped && savedRevision !== editor.projectStore.getState().revision && statusStore.getState().status !== 'error') await flush(); return }
    if (stopped || savedRevision === editor.projectStore.getState().revision) return
    const { project, revision } = editor.projectStore.getState()
    statusStore.setState({ status: 'saving', error: null })
    running = (async () => {
      try {
        await repository.save(project)
        savedRevision = revision
        statusStore.setState({ status: editor.projectStore.getState().revision === revision ? 'saved' : 'unsaved' })
      } catch (error) {
        statusStore.setState({ status: 'error', error: error instanceof Error ? error.message : 'Ошибка сохранения' })
      }
    })()
    await running
    running = undefined
    if (!stopped && statusStore.getState().status === 'unsaved') await flush()
  }
  const schedule = () => {
    statusStore.setState({ status: 'unsaved', error: null })
    clearTimeout(timer)
    timer = setTimeout(() => { void flush() }, delay)
  }
  const unsubscribe = editor.projectStore.subscribe(schedule)
  schedule()
  return { statusStore, flush, stop: () => { stopped = true; clearTimeout(timer); unsubscribe() } }
}
export type Autosave = ReturnType<typeof startAutosave>
