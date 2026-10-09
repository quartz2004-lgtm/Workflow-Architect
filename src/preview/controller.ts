import { createStore } from 'zustand/vanilla'
import type { Project } from '../domain/schema'
import { validateProject } from '../validation/validate-project'
import { previewPlan, type PreviewStep } from './plan'

type Status = 'idle' | 'running' | 'paused' | 'complete' | 'blocked'
export function createPreviewController() {
  const store = createStore(() => ({ open: false, status: 'idle' as Status, steps: [] as PreviewStep[], index: -1, message: '' }))
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined }
  const advance = () => {
    const state = store.getState()
    if (!state.steps.length || state.status === 'blocked' || state.status === 'complete') return
    if (state.index + 1 >= state.steps.length) { clear(); store.setState({ status: 'complete' }) }
    else store.setState({ index: state.index + 1 })
  }
  const schedule = () => {
    clear()
    if (store.getState().status !== 'running') return
    timer = setTimeout(() => { advance(); schedule() }, 850)
  }
  return {
    store,
    start: (project: Project, graphId: string | null, reducedMotion = false) => {
      clear()
      const errors = validateProject(project).filter(issue => issue.severity === 'error')
      if (errors.length) { store.setState({ open: true, status: 'blocked', steps: [], index: -1, message: `${errors.length} Errors. Исправьте структуру перед Preview.` }); return }
      const steps = previewPlan(project, graphId)
      store.setState({ open: true, status: steps.length ? reducedMotion ? 'paused' : 'running' : 'idle', steps, index: steps.length ? 0 : -1, message: steps.length ? '' : 'Добавьте узлы для Preview.' })
      schedule()
    },
    pause: () => { clear(); if (store.getState().status === 'running') store.setState({ status: 'paused' }) },
    resume: () => { if (store.getState().status === 'paused') { store.setState({ status: 'running' }); schedule() } },
    step: () => { clear(); if (store.getState().status === 'running') store.setState({ status: 'paused' }); advance() },
    stop: () => { clear(); store.setState({ open: false, status: 'idle', steps: [], index: -1, message: '' }) },
  }
}
