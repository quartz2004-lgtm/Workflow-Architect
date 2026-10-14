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
import { z } from 'zod'
import { profileIds } from '../profiles/schema'

/** Private child/main channel. No renderer command can request plaintext credentials. */
export class CredentialChannel {
  private pending = new Map<string, { resolve(value: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  constructor(private readonly send: (value: unknown) => void) {}
  resolve = (profileId: string, credentialId: string): Promise<string> => {
    z.enum(profileIds).parse(profileId); z.uuid().parse(credentialId)
    if (this.pending.size >= 16) return Promise.reject(new Error('Слишком много запросов подключений.'))
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('Хранилище не подтвердило доступ к подключению.')) }, 10000)
      this.pending.set(requestId, { resolve, reject, timer })
      this.send({ version: '0.3.1', kind: 'credential-resolve', requestId, profileId, credentialId })
    })
  }
  receive(value: unknown): boolean {
    if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'credential-result') return false
    const reply = z.strictObject({ version: z.literal('0.3.1'), kind: z.literal('credential-result'), requestId: z.uuid(), secret: z.string().max(65536).optional() }).safeParse(value)
    if (!reply.success) return true
    const request = this.pending.get(reply.data.requestId)
    if (!request) return true
    this.pending.delete(reply.data.requestId); clearTimeout(request.timer)
    if (reply.data.secret) request.resolve(reply.data.secret)
    else request.reject(new Error('Подключение отозвано, отсутствует или недоступно этому профилю.'))
    return true
  }
}
