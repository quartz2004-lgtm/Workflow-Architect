import { openDB, type DBSchema } from 'idb'
import { createProfile, profileIds, profileSchema, type Profile } from './schema'

interface ProfileDB extends DBSchema {
  profiles: { key: string; value: Profile }
  preferences: { key: string; value: string }
}
export function createProfileRepository(name = 'workflow-architect-profiles') {
  const database = openDB<ProfileDB>(name, 1, { upgrade(db) { db.createObjectStore('profiles'); db.createObjectStore('preferences') } })
  return {
    async initialize() {
      const db = await database
      const tx = db.transaction(['profiles', 'preferences'], 'readwrite')
      for (const index of [0, 1] as const) {
        if (await tx.objectStore('profiles').get(profileIds[index]) === undefined) await tx.objectStore('profiles').put(createProfile(index), profileIds[index])
      }
      if (await tx.objectStore('preferences').get('active-profile') === undefined) await tx.objectStore('preferences').put(profileIds[0], 'active-profile')
      await tx.done
    },
    async list() {
      const db = await database
      return Promise.all(profileIds.map(async id => profileSchema.parse(await db.get('profiles', id))))
    },
    async loadActive() {
      const db = await database
      const id = await db.get('preferences', 'active-profile')
      if (!profileIds.some(value => value === id)) throw new Error('Не удалось определить активный профиль. Настройки сохранены без изменений.')
      return profileSchema.parse(await db.get('profiles', id!))
    },
    async save(input: Profile): Promise<Profile> {
      const profile = profileSchema.parse(input)
      const db = await database
      const tx = db.transaction('profiles', 'readwrite')
      const stored = profileSchema.safeParse(await tx.store.get(profile.id))
      if (!stored.success || stored.data.revision !== profile.revision) {
        tx.abort(); await tx.done.catch(() => {})
        throw new Error('Настройки профиля изменены в другом окне. Откройте их заново перед сохранением.')
      }
      const next = { ...profile, revision: profile.revision + 1 }
      await tx.store.put(next, profile.id)
      await tx.done
      return next
    },
    async activate(id: Profile['id']) {
      const db = await database
      profileSchema.parse(await db.get('profiles', id))
      await db.put('preferences', id, 'active-profile')
    },
  }
}
export type ProfileRepository = ReturnType<typeof createProfileRepository>
