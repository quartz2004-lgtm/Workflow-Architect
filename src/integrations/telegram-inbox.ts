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
})
export type Incoming = z.infer<typeof incomingSchema>
export class TelegramInbox {
  private cursors: AtomicStore<z.infer<typeof cursorSchema>>
  private inbox: AtomicStore<Incoming>
  constructor(directory: string) {
    this.cursors = new AtomicStore(join(directory, 'cursors'), cursorSchema, { maxRecords: 100 })
    this.inbox = new AtomicStore(join(directory, 'events'), incomingSchema, { maxRecords: 10000, maxRecordBytes: 32768, maxTotalBytes: 128 * 1024 * 1024 })
  }
  offset(botId: string) { return this.cursors.ids().map(id => this.cursors.read(id)).find(item => item.botId === botId)?.offset ?? 0 }
  advance(botId: string, offset: number) {
    const old = this.cursors.ids().map(id => this.cursors.read(id)).find(item => item.botId === botId)
    if (old && old.offset >= offset) return
    const record = cursorSchema.parse({ id: old?.id ?? randomUUID(), botId, offset })
    this.cursors.write(record.id, record, old ? 'replace' : 'create')
  }
  register(value: Omit<Incoming, 'id' | 'status' | 'error'>): Incoming {
    const duplicate = this.inbox.ids().map(id => this.inbox.read(id)).find(item => item.botId === value.botId && item.updateId === value.updateId)
    if (duplicate) return duplicate
    const record = incomingSchema.parse({ ...value, id: randomUUID(), status: 'pending', error: '' })
    this.inbox.write(record.id, record, 'create'); return record
  }
  pending(botId: string) { return this.inbox.ids().map(id => this.inbox.read(id)).filter(item => item.botId === botId && item.status === 'pending').sort((a, b) => a.updateId - b.updateId) }
  finish(record: Incoming, error = '') { this.inbox.write(record.id, { ...record, status: error ? 'failed' : 'done', error: error.slice(0, 4000) }, 'replace') }
  failures(profileId: string) { return this.inbox.ids().map(id => this.inbox.read(id)).filter(item => item.profileId === profileId && item.status === 'failed').map(({ id, updateId, error }) => ({ id, updateId, error })) }
}
