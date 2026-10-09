import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { createProfileRepository } from './repository'
import { profileIds } from './schema'
import { recommendPreferences } from './recommendations'

it('initializes two profiles atomically, isolates preferences and persists active choice', async () => {
  const name = crypto.randomUUID()
  const a = createProfileRepository(name), b = createProfileRepository(name)
  await Promise.all([a.initialize(), b.initialize()])
  expect(await a.list()).toHaveLength(2)
  const first = await a.loadActive()
  await a.save({ ...first, name: 'Мой профиль', onboarding: 'skipped', preferences: { ...first.preferences, density: 'compact' } })
  await b.activate(profileIds[1])
  const second = await createProfileRepository(name).loadActive()
  expect(second.name).toBe('Профиль 2')
  expect(second.preferences.density).toBe('comfortable')
  expect(second.onboarding).toBe('new')
  await b.activate(profileIds[0])
  expect((await b.loadActive()).preferences.density).toBe('compact')
  await expect(b.save(first)).rejects.toThrow('другом окне')
  expect((await a.loadActive()).name).toBe('Мой профиль')
})

it('rejects invalid settings without changing saved data and explains recommendations', async () => {
  const repository = createProfileRepository(crypto.randomUUID())
  await repository.initialize()
  const profile = await repository.loadActive()
  await expect(repository.save({ ...profile, preferences: { ...profile.preferences, recommendedMaxSteps: -1 } })).rejects.toThrow()
  expect(await repository.loadActive()).toEqual(profile)
  const beginner = recommendPreferences(profile.answers)[0]!
  expect(beginner.preferences.detail).toBe('guided')
  const advanced = recommendPreferences({ ...profile.answers, experience: 'advanced', control: 'manual', practice: 'completed' })[0]!
  expect(advanced.preferences.defaultMode).toBe('engineering')
  expect(advanced.reason).not.toBe(beginner.reason)
})
