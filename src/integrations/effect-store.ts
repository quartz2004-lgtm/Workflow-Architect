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
import { z } from 'zod'
import { AtomicStore } from '../runtime/atomic-store'
import { profileIds } from '../profiles/schema'
import { assertValueBudget } from '../execution/values'
import type { JsonValue } from '../domain/execution-config'

const recordSchema = z.strictObject({ version: z.literal('0.5'), id: z.uuid(), profileId: z.enum(profileIds), key: z.string().min(1).max(500), fingerprint: z.string(), status: z.enum(['pending', 'succeeded', 'unknown']), result: z.json().nullable() })
type Effect = z.infer<typeof recordSchema>
export class UnknownEffectError extends Error {}
export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`
  return JSON.stringify(value)
}
export const contentHash = (value: string) => createHash('sha256').update(value).digest('hex')

/** Exactly-once local registration, not a claim of exactly-once delivery by a remote API. */
export class EffectStore {
  private disk: AtomicStore<Effect>
  private records = new Map<string, Effect>()
  private active = new Map<string, Promise<JsonValue>>()
  constructor(directory: string) {
    this.disk = new AtomicStore(directory, recordSchema, { maxRecords: 10000, maxRecordBytes: 3 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024 })
    for (const id of this.disk.ids()) {
      const record = this.disk.read(id)
      if (record.id !== id || this.records.has(`${record.profileId}:${record.key}`)) throw new Error('Повреждён журнал внешних действий. Автоматическое выполнение остановлено.')
      this.records.set(`${record.profileId}:${record.key}`, record)
    }
  }
  async perform(profileId: string, key: string, fingerprintValue: JsonValue, action: () => Promise<JsonValue>): Promise<JsonValue> {
    z.enum(profileIds).parse(profileId); z.string().min(1).max(500).parse(key); assertValueBudget(fingerprintValue)
    const index = `${profileId}:${key}`, fingerprint = contentHash(canonicalJson(fingerprintValue)), old = this.records.get(index)
    if (old && old.fingerprint !== fingerprint) throw new Error('Ключ внешнего действия уже использован с другими параметрами.')
    const pending = this.active.get(index)
    if (pending) return structuredClone(await pending)
    if (old?.status === 'succeeded') return structuredClone(old.result)
    if (old) throw new UnknownEffectError('Результат внешнего действия неизвестен. Проверьте внешний сервис; автоматический повтор запрещён.')
    const record: Effect = { version: '0.5', id: randomUUID(), profileId: z.enum(profileIds).parse(profileId), key, fingerprint, status: 'pending', result: null }
    this.disk.write(record.id, record, 'create'); this.records.set(index, record)
    const work = Promise.resolve().then(action).then(result => {
      assertValueBudget(result)
      const done: Effect = { ...record, status: 'succeeded', result }
      this.disk.write(record.id, done, 'replace'); this.records.set(index, done)
      return result
    }).catch(error => {
      const unknown: Effect = { ...record, status: 'unknown' }
      this.disk.write(record.id, unknown, 'replace'); this.records.set(index, unknown)
      throw error
    }).finally(() => { this.active.delete(index) })
    this.active.set(index, work)
    return structuredClone(await work)
  }
  listUnknown(profileId: string) { z.enum(profileIds).parse(profileId); return [...this.records.values()].filter(record => record.profileId === profileId && record.status !== 'succeeded').map(({ id, key, status }) => ({ id, key, status })) }
  status(profileId: string, key: string) { z.enum(profileIds).parse(profileId); return this.records.get(`${profileId}:${key}`)?.status ?? null }
}
