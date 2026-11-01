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

import { createHash, randomUUID } from 'node:crypto'
import { AtomicStore } from '../runtime/atomic-store'
import { profileIds } from '../profiles/schema'
import { z } from 'zod'
import { processContentSchema, processLibrarySchema, processSnapshotSchema, voiceDraftSchema, type ProcessLibrary, type ProcessSnapshot } from './process-schema'

const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const ownerSchema = z.enum(profileIds)

/** Native single-writer library. No implicit learning or adoption of user edits. */
export class EditorialProcessService {
  private readonly store: AtomicStore<ProcessLibrary>
  constructor(directory: string) {
    this.store = new AtomicStore(directory, processLibrarySchema, { maxRecords: 2, maxRecordBytes: 2 * 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024 })
  }
  read(profileId: string): ProcessLibrary {
    const owner = ownerSchema.parse(profileId)
    if (!this.store.ids().includes(owner)) return { schemaVersion: '0.5.5', profileId: owner, revision: 0, versions: [], examples: [], selectedVersionId: null }
    const library = this.store.read(owner)
    if (library.profileId !== owner) throw new Error('Библиотека принадлежит другому профилю.')
    for (const version of library.versions) if (hash(JSON.stringify(version.content)) !== version.digest) throw new Error('Настройки версии повреждены.')
    for (const example of library.examples) if (hash(example.text) !== example.digest) throw new Error('Текст примера повреждён.')
    return library
  }
  private mutate(profileId: string, expectedRevision: number, action: (library: ProcessLibrary) => void) {
    const library = this.read(profileId)
    if (library.revision !== expectedRevision) throw new Error('Настройки уже изменились. Обновите библиотеку и повторите действие.')
    action(library)
    library.revision++
    this.store.write(library.profileId, library, this.store.ids().includes(library.profileId) ? 'replace' : 'create')
    return this.read(profileId)
  }
  addExample(profileId: string, revision: number, input: unknown) {
    const draft = voiceDraftSchema.parse(input)
    return this.mutate(profileId, revision, library => {
      library.examples.push({ ...draft, id: randomUUID(), digest: hash(draft.text), createdAt: new Date().toISOString(), status: 'pending' })
    })
  }
  acceptExample(profileId: string, revision: number, exampleId: string, expectedDigest: string) {
    return this.mutate(profileId, revision, library => {
      const example = library.examples.find(item => item.id === exampleId)
      if (!example || example.status !== 'pending' || example.digest !== expectedDigest) throw new Error('Пример изменился или недоступен. Откройте его заново.')
      example.status = 'accepted'; example.acceptedAt = new Date().toISOString()
    })
  }
  revokeExample(profileId: string, revision: number, exampleId: string) {
    return this.mutate(profileId, revision, library => {
      const example = library.examples.find(item => item.id === exampleId)
      if (!example || example.status !== 'accepted') throw new Error('Принятый пример не найден.')
      example.status = 'revoked'; example.revokedAt = new Date().toISOString()
    })
  }
  saveVersion(profileId: string, revision: number, input: unknown) {
    const content = processContentSchema.parse(input)
    return this.mutate(profileId, revision, library => {
      for (const id of content.voiceExampleIds) if (!library.examples.some(item => item.id === id && item.status === 'accepted')) throw new Error('Выберите только явно принятые примеры.')
      library.versions.push({ id: randomUUID(), number: library.versions.length + 1, createdAt: new Date().toISOString(), content, digest: hash(JSON.stringify(content)) })
      // Saving a version does not silently activate it for the next task.
    })
  }
  selectVersion(profileId: string, revision: number, versionId: string | null) {
    return this.mutate(profileId, revision, library => {
      if (versionId) this.snapshot(library, versionId)
      library.selectedVersionId = versionId
    })
  }
  private snapshot(library: ProcessLibrary, versionId: string): ProcessSnapshot {
    const version = library.versions.find(item => item.id === versionId)
    if (!version) throw new Error('Версия настроек не найдена.')
    const examples = version.content.voiceExampleIds.map(id => {
      const example = library.examples.find(item => item.id === id)
      if (!example || example.status !== 'accepted') throw new Error('Пример отозван. Выберите другую версию или сохраните настройки без него.')
      return example
    })
    const content = { schemaVersion: '0.5.5' as const, profileId: library.profileId, version, examples }
    return processSnapshotSchema.parse({ ...content, digest: hash(JSON.stringify(content)) })
  }
  capture(profileId: string): ProcessSnapshot | null {
    const library = this.read(profileId)
    return library.selectedVersionId ? this.snapshot(library, library.selectedVersionId) : null
  }
  assertUsable(profileId: string, raw: unknown) {
    const snapshot = processSnapshotSchema.parse(raw), { digest, ...content } = snapshot
    if (snapshot.profileId !== profileId || hash(JSON.stringify(content)) !== digest) throw new Error('Снимок настроек изменён или принадлежит другому профилю.')
    const current = this.snapshot(this.read(profileId), snapshot.version.id)
    if (current.digest !== digest) throw new Error('Снимок настроек больше недоступен.')
    return snapshot
  }
}
