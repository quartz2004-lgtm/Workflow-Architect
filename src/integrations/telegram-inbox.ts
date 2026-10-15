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
import { join } from 'node:path'
import { z } from 'zod'
import { AtomicStore } from '../runtime/atomic-store'
import { profileIds } from '../profiles/schema'

const cursorSchema = z.strictObject({ id: z.uuid(), botId: z.string(), offset: z.number().int().nonnegative() })
export const incomingSchema = z.strictObject({
  id: z.uuid(), botId: z.string(), updateId: z.number().int().nonnegative(), profileId: z.enum(profileIds), bindingId: z.uuid(), workflowId: z.uuid().nullable(), previousJobId: z.uuid().nullable(),
  text: z.string().max(4096), callbackId: z.string().max(200).nullable(), status: z.enum(['pending', 'done', 'failed']), error: z.string().max(4000),
  guided: z.strictObject({ mode: z.enum(['create', 'edit', 'expired', 'changed']), promptUpdateId: z.number().int().nonnegative() }).nullable().default(null),
})
export type Incoming = z.infer<typeof incomingSchema>
export class TelegramInbox {
  private cursors: AtomicStore<z.infer<typeof cursorSchema>>
  private inbox: AtomicStore<Incoming>
  private cursorIndex = new Map<string, z.infer<typeof cursorSchema>>()
  private events = new Map<string, Incoming>()
  constructor(directory: string) {
    this.cursors = new AtomicStore(join(directory, 'cursors'), cursorSchema, { maxRecords: 100 })
    this.inbox = new AtomicStore(join(directory, 'events'), incomingSchema, { maxRecords: 10000, maxRecordBytes: 32768, maxTotalBytes: 128 * 1024 * 1024 })
    for (const id of this.cursors.ids()) {
      const record = this.cursors.read(id)
      if (record.id !== id || this.cursorIndex.has(record.botId)) throw new Error('Повреждён журнал Telegram offset.')
      this.cursorIndex.set(record.botId, record)
    }
    for (const id of this.inbox.ids()) {
      const record = this.inbox.read(id), key = `${record.botId}:${record.updateId}`
      if (record.id !== id || this.events.has(key)) throw new Error('Повреждён журнал входящих Telegram-событий.')
      this.events.set(key, record)
    }
  }
  offset(botId: string) { return this.cursorIndex.get(botId)?.offset ?? 0 }
  event(botId: string, updateId: number) { const record = this.events.get(`${botId}:${updateId}`); return record ? structuredClone(record) : null }
  advance(botId: string, offset: number) {
    const old = this.cursorIndex.get(botId)
    if (old && old.offset >= offset) return
    const record = cursorSchema.parse({ id: old?.id ?? randomUUID(), botId, offset })
    this.cursors.write(record.id, record, old ? 'replace' : 'create')
    this.cursorIndex.set(botId, record)
  }
  register(value: Omit<Incoming, 'id' | 'status' | 'error' | 'guided'> & { guided?: Incoming['guided'] }): Incoming {
    const key = `${value.botId}:${value.updateId}`, duplicate = this.events.get(key)
    if (duplicate) return structuredClone(duplicate)
    const record = incomingSchema.parse({ ...value, id: randomUUID(), status: 'pending', error: '' })
    this.inbox.write(record.id, record, 'create'); this.events.set(key, record); return structuredClone(record)
  }
  pending(botId: string) { return structuredClone([...this.events.values()].filter(item => item.botId === botId && item.status === 'pending').sort((a, b) => a.updateId - b.updateId)) }
  finish(record: Incoming, error = '') {
    const next: Incoming = { ...record, status: error ? 'failed' : 'done', error: error.slice(0, 4000) }
    this.inbox.write(record.id, next, 'replace'); this.events.set(`${record.botId}:${record.updateId}`, next)
  }
  failures(profileId: string) { return [...this.events.values()].filter(item => item.profileId === profileId && item.status === 'failed').slice(-100).map(({ id, updateId, error }) => ({ id, updateId, error })) }
}
