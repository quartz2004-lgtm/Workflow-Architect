import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNode, createProject } from '../domain/factories'
import { createEditor } from '../editor/session'
import { startAutosave } from './autosave'
import { createRepository, loadProject, type ProjectRepository } from './repository'

afterEach(() => vi.useRealTimers())
describe('local persistence', () => {
  it('reopens and lists a saved snapshot larger than the legacy 10 MiB quota', async () => {
    const name = crypto.randomUUID()
    const project = createProject('Large local project')
    project.nodes = Array.from({ length: 115 }, () => ({ ...createNode(), description: 'x'.repeat(95000) }))
    const repository = createRepository(name)
    await repository.save(project)
    expect(new TextEncoder().encode((await repository.loadActive())!).length).toBeGreaterThan(10 * 1024 * 1024)
    expect(await loadProject(createRepository(name))).toEqual(project)
    expect(await repository.list()).toEqual([{ id: project.project.id, name: project.project.name, updatedAt: project.project.updatedAt, damaged: false }])
  })
  it('restores the durable project from a fresh IndexedDB repository instance', async () => {
    const name = crypto.randomUUID()
    const p = createProject()
    p.nodes.push(createNode())
    await createRepository(name).save(p)
    expect(await loadProject(createRepository(name))).toEqual(p)
  })
  it('debounces edits and saves undo/redo changes', async () => {
    vi.useFakeTimers()
    const repo: ProjectRepository = { loadActive: async () => undefined, save: vi.fn(async () => {}) }
    const editor = createEditor()
    const autosave = startAutosave(editor, repo)
    editor.execute({ type: 'create-node', node: createNode() })
    editor.execute({ type: 'create-node', node: createNode() })
    await vi.advanceTimersByTimeAsync(450)
    expect(repo.save).toHaveBeenCalledTimes(1)
    expect(autosave.statusStore.getState().status).toBe('saved')
    editor.undo(); await autosave.flush()
    expect(repo.save).toHaveBeenLastCalledWith(editor.projectStore.getState().project)
    editor.redo(); await autosave.flush()
    expect(repo.save).toHaveBeenCalledTimes(3)
    autosave.stop()
  })
  it('serializes writes and persists the latest edit arriving during an in-flight save', async () => {
    let finish: (() => void) | undefined
    const saved: number[] = []
    const repo: ProjectRepository = { loadActive: async () => undefined, save: vi.fn(async p => { saved.push(p.nodes.length); if (saved.length === 1) await new Promise<void>(resolve => { finish = resolve }) }) }
    const editor = createEditor()
    const autosave = startAutosave(editor, repo)
    const first = autosave.flush()
    editor.execute({ type: 'create-node', node: createNode() })
    const second = autosave.flush()
    finish?.()
    await Promise.all([first, second])
    expect(saved).toEqual([0, 1])
    expect(autosave.statusStore.getState().status).toBe('saved')
    autosave.stop()
  })
  it('retains the project and permits retry after a storage failure', async () => {
    let fail = true
    const repo: ProjectRepository = { loadActive: async () => undefined, save: async () => { if (fail) throw new Error('Quota exceeded') } }
    const editor = createEditor()
    const autosave = startAutosave(editor, repo)
    const before = editor.projectStore.getState().project
    await autosave.flush()
    expect(autosave.statusStore.getState()).toEqual({ status: 'error', error: 'Quota exceeded', conflict: false })
    expect(editor.projectStore.getState().project).toBe(before)
    fail = false; await autosave.flush()
    expect(autosave.statusStore.getState().status).toBe('saved')
    autosave.stop()
  })
})
