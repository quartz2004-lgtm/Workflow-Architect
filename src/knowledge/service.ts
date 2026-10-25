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

import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { AtomicStore } from '../runtime/atomic-store'
import { knowledgeBackupSchema, knowledgeCollectionSchema, knowledgeDocumentViewSchema, knowledgeLimits, type KnowledgeCollection, type KnowledgeSnapshot, type KnowledgeView } from './schema'
import { documentId, importSnapshot, KnowledgeError, verifySnapshot } from './importer'
import type { ContextSource } from './context'

type Candidate = { token: string; expiresAt: string; collection: KnowledgeCollection; expectedRevision: number | undefined }
export const snapshotView = (snapshot: KnowledgeSnapshot) => ({ ...snapshot, documents: snapshot.documents.map(document => knowledgeDocumentViewSchema.parse(Object.fromEntries(Object.entries(document).filter(([key]) => key !== 'content')))) })

/** One native writer. Source text is data; this service never executes it or calls a model. */
export class KnowledgeService {
  private readonly store: AtomicStore<KnowledgeCollection>
  private readonly candidates = new Map<string, Candidate>()
  constructor(directory: string) {
    this.store = new AtomicStore(directory, knowledgeCollectionSchema, { maxRecordBytes: 28 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024, maxRecords: 16 })
  }
  private read(profileId: string, id: string) {
    const collection = this.store.read(id)
    if (collection.profileId !== profileId) throw new KnowledgeError('Коллекция недоступна в этом профиле.')
    for (const snapshot of collection.snapshots) verifySnapshot(snapshot)
    return collection
  }
  private version(profileId: string, id: string, revision: number) {
    const collection = this.read(profileId, id)
    if (collection.revision !== revision) throw new KnowledgeError('Коллекция уже изменилась. Обновите список и повторите действие.')
    return collection
  }
  async list(profileId: string) {
    const collections: KnowledgeView[] = []; let damaged = 0
    for (const id of this.store.ids()) {
      let collection
      try { collection = this.store.read(id) } catch { damaged++; continue }
      if (collection.profileId !== profileId) continue
      try {
        collection = this.read(profileId, id)
        let sourceAvailable = false
        if (collection.sourcePath) { try { await access(collection.sourcePath); sourceAvailable = true } catch { /* Snapshot remains available offline. */ } }
        collections.push({ ...collection, snapshots: collection.snapshots.map(snapshotView), sourceAvailable })
      } catch { damaged++ }
    }
    return { collections, damaged }
  }
  async prepare(input: { profileId: KnowledgeCollection['profileId']; id?: string; revision?: number; label: string; sourcePath: string; selectedPaths: string[] }) {
    const old = input.id ? this.version(input.profileId, input.id, input.revision ?? -1) : undefined
    const id = old?.id ?? randomUUID()
    const snapshot = await importSnapshot(input.sourcePath, input.selectedPaths, id)
    const prior = old?.snapshots[0]
    const before = new Map(prior?.documents.map(doc => [doc.path, doc.hash]) ?? [])
    const after = new Map(snapshot.documents.map(doc => [doc.path, doc.hash]))
    const token = randomUUID(), expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
    const collection = knowledgeCollectionSchema.parse({ schemaVersion: '0.5.2', id, profileId: input.profileId, revision: (old?.revision ?? -1) + 1, enabled: old?.enabled ?? true,
      label: input.label, sourcePath: input.sourcePath, selectedPaths: [...new Set(input.selectedPaths)], snapshots: [snapshot, ...(old?.snapshots ?? [])].slice(0, knowledgeLimits.history) })
    // Keep at most one pending import per profile. A new preview invalidates the old token.
    for (const [key, candidate] of this.candidates) if (candidate.collection.profileId === input.profileId || Date.parse(candidate.expiresAt) < Date.now()) this.candidates.delete(key)
    this.candidates.set(token, { token, expiresAt, collection, expectedRevision: old?.revision })
    return { token, expiresAt, snapshot: snapshotView(snapshot), added: [...after.keys()].filter(path => !before.has(path)), changed: [...after].filter(([path, hash]) => before.has(path) && before.get(path) !== hash).map(([path]) => path), removed: [...before.keys()].filter(path => !after.has(path)) }
  }
  private candidate(profileId: string, token: string) {
    const value = this.candidates.get(token)
    if (!value || value.collection.profileId !== profileId || Date.parse(value.expiresAt) < Date.now()) throw new KnowledgeError('Предпросмотр устарел. Подготовьте новый снимок.')
    return value
  }
  previewDocument(profileId: string, token: string, documentId: string) {
    const doc = this.candidate(profileId, token).collection.snapshots[0]!.documents.find(doc => doc.id === documentId)
    if (!doc) throw new KnowledgeError('Документ не найден.')
    return doc
  }
  commit(profileId: string, token: string) {
    const candidate = this.candidate(profileId, token), { collection, expectedRevision } = candidate
    if (expectedRevision !== undefined) this.version(profileId, collection.id, expectedRevision)
    this.store.write(collection.id, collection, expectedRevision === undefined ? 'create' : 'replace')
    this.candidates.delete(token)
    return collection.id
  }
  inspect(profileId: string, id: string, snapshotId: string, documentId: string) {
    const collection = this.read(profileId, id)
    if (!collection.enabled) throw new KnowledgeError('Доступ к знаниям отозван. Разрешите использование коллекции для просмотра.')
    const document = collection.snapshots.find(snapshot => snapshot.id === snapshotId)?.documents.find(doc => doc.id === documentId)
    if (!document) throw new KnowledgeError('Документ не найден в выбранном снимке.')
    return document
  }
  /** Freeze explicit selections before a run. Never fall back to another profile or newer version. */
  capture(profileId: string, selections: readonly { collectionId: string; snapshotId?: string }[]): ContextSource[] {
    if (selections.length > 4 || new Set(selections.map(item => item.collectionId)).size !== selections.length) throw new KnowledgeError('Выберите не более четырёх разных коллекций.')
    return selections.map(selection => {
      const collection = this.read(profileId, selection.collectionId)
      if (!collection.enabled) throw new KnowledgeError('Доступ к знаниям отозван. Разрешите использование выбранной коллекции.')
      const snapshot = selection.snapshotId ? collection.snapshots.find(item => item.id === selection.snapshotId) : collection.snapshots[0]
      if (!snapshot) throw new KnowledgeError('Выбранный снимок знаний больше недоступен. Выберите версию явно.')
      return { collectionId: collection.id, snapshot: structuredClone(snapshot) }
    })
  }
  assertAllowed(profileId: string, collectionIds: readonly string[]): void {
    for (const id of collectionIds) if (!this.read(profileId, id).enabled) throw new KnowledgeError('Доступ к знаниям отозван. Запрос модели не выполнен.')
  }
  change(profileId: string, id: string, revision: number, action: 'enable' | 'prune' | 'remove', enabled?: boolean) {
    const collection = this.version(profileId, id, revision)
    if (action === 'remove') { this.store.remove(id); return }
    this.store.write(id, { ...collection, revision: collection.revision + 1, ...(action === 'prune' ? { snapshots: collection.snapshots.slice(0, 1) } : { enabled: enabled === true }) }, 'replace')
  }
  backup(profileId: string, id: string) {
    const collection = this.read(profileId, id)
    return knowledgeBackupSchema.parse({ schemaVersion: '0.5.2', kind: 'workflow-knowledge-backup', label: collection.label, selectedPaths: collection.selectedPaths, snapshots: collection.snapshots })
  }
  restore(profileId: KnowledgeCollection['profileId'], value: unknown) {
    const backup = knowledgeBackupSchema.parse(value)
    for (const snapshot of backup.snapshots) verifySnapshot(snapshot)
    const id = randomUUID()
    // Imported identity belongs to a new collection; references from another profile cannot resolve it.
    const snapshots = backup.snapshots.map(snapshot => ({ ...snapshot, id: randomUUID(), documents: snapshot.documents.map(doc => ({ ...doc, id: documentId(id, doc.path) })) }))
    this.store.write(id, { schemaVersion: '0.5.2', id, profileId, label: backup.label, sourcePath: '', revision: 0, enabled: false, selectedPaths: backup.selectedPaths, snapshots }, 'create')
    return id
  }
}
