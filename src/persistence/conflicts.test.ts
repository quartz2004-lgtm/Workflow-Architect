import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { createProject } from '../domain/factories'
import { createEditor } from '../editor/session'
import { createRepository, loadProject } from './repository'
import { startAutosave } from './autosave'
import { ProjectConflictError } from './conflicts'
import { switchProject } from './switch-project'

it('atomically rejects a stale writer, including concurrent writes from two windows', async () => {
  const name = crypto.randomUUID(), first = createRepository(name), second = createRepository(name)
  const initial = createProject()
  await first.save(initial)
  await loadProject(second)
  const a = { ...initial, project: { ...initial.project, name: 'A' } }
  const b = { ...initial, project: { ...initial.project, name: 'B' } }
  const results = await Promise.allSettled([first.save(a), second.save(b)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.any(ProjectConflictError) })])
  expect((await loadProject(createRepository(name)))!.project.name).toBe('A')
})

it('keeps dirty edits and saves a separate copy; reopening the latest original then works', async () => {
  const name = crypto.randomUUID(), other = createRepository(name), repository = createRepository(name)
  await other.save(createProject('Original'))
  const editor = createEditor((await loadProject(repository))!)
  const autosave = startAutosave(editor, repository)
  await autosave.flush()
  const original = editor.projectStore.getState().project
  await other.save({ ...original, project: { ...original.project, name: 'Other window' } })
  editor.execute({ type: 'edit-project', changes: { name: 'My changes' } })
  await autosave.flush()
  expect(autosave.statusStore.getState().conflict).toBe(true)
  expect(editor.projectStore.getState().project.project.name).toBe('My changes')
  // Even looking up the same project for a preview must not reset the stale write base.
  await repository.load(original.project.id)
  await autosave.flush()
  expect(autosave.statusStore.getState().conflict).toBe(true)
  await autosave.saveAsCopy()
  expect(editor.projectStore.getState().project.project.id).not.toBe(original.project.id)
  expect((await repository.list()).map(item => item.name).sort()).toEqual(['My changes — моя копия', 'Other window'])
  const latest = await loadProject(createRepository(name))
  expect(latest!.project.name).toContain('My changes')
  const originalRaw = await repository.load(original.project.id)
  await switchProject(editor, autosave, JSON.parse(originalRaw!))
  editor.execute({ type: 'edit-project', changes: { name: 'Accepted latest' } })
  await autosave.flush()
  expect(autosave.statusStore.getState().status).toBe('saved')
  autosave.stop()
})

it('rejects a project changed after reading but before adoption', async () => {
  const name = crypto.randomUUID(), a = createRepository(name), b = createRepository(name)
  const project = createProject('Base')
  await a.save(project); await b.load(project.project.id)
  await a.save({ ...project, project: { ...project.project, name: 'New' } })
  await expect(b.adopt!(project)).rejects.toThrow(ProjectConflictError)
})
