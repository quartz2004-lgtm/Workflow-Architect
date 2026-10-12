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

import { z } from 'zod'
import { AtomicStore } from '../runtime/atomic-store'
import { assertNoObviousSecrets } from '../domain/serialization'
import { assertValueBudget } from '../execution/values'
import { credentialMetadataSchema, credentialRecordSchema, type CredentialRecord, type CredentialView } from './schema'
import { SecretRedactor } from './redactor'

export interface SecretCipher {
  available(): Promise<boolean>
  encrypt(value: string): Promise<Buffer>
  decrypt(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>
}
export class CredentialError extends Error {}

/** The renderer has no access to this class or its resolve method. */
export class CredentialVault {
  private readonly disk: AtomicStore<CredentialRecord>
  private records = new Map<string, CredentialRecord>()
  private unreadable = new Set<string>()
  private encryptionAvailable = false
  private queue = Promise.resolve()
  private queued = 0
  private initialized = false
  readonly redactor = new SecretRedactor()
  readonly damaged: string[] = []
  constructor(directory: string, private readonly cipher: SecretCipher) {
    this.disk = new AtomicStore(directory, credentialRecordSchema, { maxRecords: 100, maxRecordBytes: 64 * 1024, maxTotalBytes: 8 * 1024 * 1024 })
  }
  async initialize() {
    if (this.initialized) return
    this.encryptionAvailable = await this.cipher.available().catch(() => false)
    for (const id of this.disk.ids()) {
      let record: CredentialRecord
      try {
        record = this.disk.read(id)
        if (record.id !== id) throw new Error('Invalid credential ID')
        this.records.set(id, record)
      } catch { this.damaged.push(id); continue }
      try {
        if (!this.encryptionAvailable) throw new Error('Encryption unavailable')
        const decrypted = await this.cipher.decrypt(Buffer.from(record.ciphertext, 'base64'))
        this.redactor.add(decrypted.result)
        if (decrypted.shouldReEncrypt) {
          const ciphertext = (await this.cipher.encrypt(decrypted.result)).toString('base64')
          record = { ...record, ciphertext, revision: record.revision + 1, updatedAt: new Date().toISOString() }
          this.disk.write(id, record, 'replace'); this.records.set(id, record)
        }
      } catch { this.unreadable.add(id) }
    }
    this.initialized = true
  }
  status() { return { available: this.initialized && this.encryptionAvailable, damaged: [...this.damaged], unavailable: this.unreadable.size } }
  list(profileId: string): CredentialView[] {
    const profile = credentialMetadataSchema.shape.profileId.parse(profileId)
    return [...this.records.values()].filter(record => record.profileId === profile).map(record => this.view(record))
  }
  private view(record: CredentialRecord): CredentialView {
    return { ...credentialMetadataSchema.parse(recordMetadata(record)), available: this.encryptionAvailable && !this.unreadable.has(record.id) }
  }
  private owned(profileId: string, id: string) {
    credentialMetadataSchema.shape.profileId.parse(profileId); z.uuid().parse(id)
    const record = this.records.get(id)
    if (!record || record.profileId !== profileId) throw new CredentialError('Подключение недоступно этому профилю.')
    return record
  }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.queued >= 32) return Promise.reject(new CredentialError('Слишком много запросов к хранилищу.'))
    this.queued++
    const result = this.queue.then(work)
    this.queue = result.then(() => {}, () => {}).finally(() => { this.queued-- })
    return result
  }
  create(input: { id: string; profileId: string; label: string; service: string; secret: string; enabled: boolean }): Promise<CredentialView> {
    return this.exclusive(async () => {
      if (!this.initialized || !await this.cipher.available()) throw new CredentialError('Защищённое хранилище Windows недоступно. Секрет не сохранён.')
      this.encryptionAvailable = true
      if (this.records.has(input.id)) throw new CredentialError('Подключение с таким ID уже существует. Обновите список.')
      assertValueBudget(input, 128 * 1024)
      z.string().min(1).max(8192).parse(input.secret)
      const time = new Date().toISOString()
      const metadata = credentialMetadataSchema.parse({ id: input.id, profileId: input.profileId, label: input.label, service: input.service,
        enabled: input.enabled, revision: 0, createdAt: time, updatedAt: time })
      this.redactor.add(input.secret)
      try { assertNoObviousSecrets({ label: metadata.label, service: metadata.service }) }
      catch { throw new CredentialError('Не помещайте секрет в название или назначение подключения.') }
      if (this.redactor.contains({ label: metadata.label, service: metadata.service })) throw new CredentialError('Не помещайте секрет в название или назначение подключения.')
      const ciphertext = (await this.cipher.encrypt(input.secret)).toString('base64')
      const record = credentialRecordSchema.parse({ ...metadata, recordVersion: '0.3.1', ciphertext })
      this.disk.write(record.id, record, 'create'); this.records.set(record.id, record)
      return this.view(record)
    })
  }
  setEnabled(profileId: string, id: string, enabled: boolean): Promise<CredentialView> {
    return this.exclusive(async () => {
      const record = this.owned(profileId, id)
      if (enabled && (!this.encryptionAvailable || this.unreadable.has(id))) throw new CredentialError('Сначала восстановите доступ к защищённому хранилищу.')
      const next = { ...record, enabled: z.boolean().parse(enabled), revision: record.revision + 1, updatedAt: new Date().toISOString() }
      this.disk.write(id, next, 'replace'); this.records.set(id, next)
      return this.view(next)
    })
  }
  remove(profileId: string, id: string): Promise<void> {
    return this.exclusive(async () => { this.owned(profileId, id); this.disk.remove(id); this.records.delete(id); this.unreadable.delete(id) })
  }
  reference(profileId: string, id: string): string { return this.owned(profileId, id).id }
  /** Future trusted adapters resolve at each action, never cache permission or plaintext. */
  async resolve(profileId: string, id: string): Promise<string> {
    const record = this.owned(profileId, id)
    if (!record.enabled) throw new CredentialError('Разрешение на использование отозвано.')
    if (!this.encryptionAvailable || this.unreadable.has(id)) throw new CredentialError('Секрет недоступен в защищённом хранилище.')
    let value: string
    try { value = (await this.cipher.decrypt(Buffer.from(record.ciphertext, 'base64'))).result }
    catch { this.unreadable.add(id); throw new CredentialError('Не удалось расшифровать секрет.') }
    const current = this.owned(profileId, id)
    if (!current.enabled || current.revision !== record.revision) throw new CredentialError('Разрешение изменилось во время запроса. Повторите проверку доступа.')
    this.redactor.add(value)
    return value
  }
  assertNoSecrets(value: unknown) {
    assertValueBudget(value, 24 * 1024 * 1024, true)
    if (this.redactor.contains(value)) throw new CredentialError('Секрет из хранилища обнаружен в данных запуска. Используйте credential ID вместо значения секрета.')
  }
}

function recordMetadata(record: CredentialRecord) {
  return { id: record.id, profileId: record.profileId, label: record.label, service: record.service, enabled: record.enabled,
    revision: record.revision, createdAt: record.createdAt, updatedAt: record.updatedAt }
}
