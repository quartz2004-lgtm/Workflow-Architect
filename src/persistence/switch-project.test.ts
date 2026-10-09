import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { openDB } from 'idb'
import { createNode, createProject } from '../domain/factories'
import { createEditor } from '../editor/session'
import { startAutosave } from './autosave'
import { createRepository, type ProjectRepository } from './repository'
import { switchProject } from './switch-project'

it('flushes before switching, resets history, and preserves both local projects', async () => {
  const repo = createRepository(crypto.randomUUID())
  const editor = createEditor(createProject('First'))
  const save = startAutosave(editor, repo)
  editor.execute({ type: 'create-node', node: createNode() })
  const first = editor.projectStore.getState().project
  const second = createProject('Second')
  await switchProject(editor, save, second)
  expect(editor.historyStore.getState().past).toEqual([])
  expect((await repo.list()).map(p => p.name).sort()).toEqual(['First', 'Second'])
  expect(JSON.parse((await repo.load(first.project.id))!).nodes).toHaveLength(1)
  expect(JSON.parse((await repo.loadActive())!).project.id).toBe(second.project.id)
  save.stop()
})

it('does not abandon unsaved edits when storage fails', async () => {
  const repo: ProjectRepository = { loadActive: async () => undefined, save: async () => { throw new Error('Quota exceeded') } }
  const editor = createEditor()
  const save = startAutosave(editor, repo)
  const before = editor.projectStore.getState().project
  await expect(switchProject(editor, save, createProject())).rejects.toThrow('не сохранён')
  expect(editor.projectStore.getState().project).toBe(before)
  save.stop()
})

it('lists a damaged project without hiding healthy projects or rewriting the damaged snapshot', async () => {
  const name = crypto.randomUUID()
  const repo = createRepository(name)
  await repo.save(createProject('Healthy'))
  const db = await openDB(name, 1)
  await db.put('projects', '{broken', 'damaged')
  expect(await repo.list()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Healthy', damaged: false }), expect.objectContaining({ id: 'damaged', damaged: true })]))
  expect(await repo.load('damaged')).toBe('{broken')
  db.close()
})
