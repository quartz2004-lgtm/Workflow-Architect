import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { createProject } from '../domain/factories'
import { createRepository, loadProject } from '../persistence/repository'
import { profileIds } from './schema'

it('adopts legacy workspace only for the first profile, preserving shared projects and isolated active choices', async () => {
  const name = crypto.randomUUID()
  const legacy = createRepository(name)
  const old = createProject('Legacy')
  await legacy.save(old)
  const first = createRepository(name, { id: profileIds[0], adoptLegacy: true })
  const second = createRepository(name, { id: profileIds[1], adoptLegacy: false })
  expect((await loadProject(first))?.project.id).toBe(old.project.id)
  expect(await loadProject(second)).toBeUndefined()
  const own = createProject('Second')
  await second.save(own)
  expect((await loadProject(first))?.project.id).toBe(old.project.id)
  expect((await loadProject(second))?.project.id).toBe(own.project.id)
  expect(await second.list()).toHaveLength(2)
  await first.save(old)
  await legacy.save(createProject('Other legacy window'))
  expect((await loadProject(first))?.project.id).toBe(old.project.id)
})
