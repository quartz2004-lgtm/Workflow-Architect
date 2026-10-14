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
import { profileIds } from '../profiles/schema'
import { assertNoObviousSecrets } from '../domain/serialization'
import { integrationConnectionSchema, type IntegrationConnection } from './schema'

/** Native configuration, never part of the portable graph. A captured grant is revocable. */
export class IntegrationConnections {
  private disk: AtomicStore<IntegrationConnection>
  private records = new Map<string, IntegrationConnection>()
  private generations = new Map<string, AbortController>()
  readonly damaged: string[] = []
  constructor(directory: string) {
    this.disk = new AtomicStore(directory, integrationConnectionSchema, { maxRecords: 100, maxRecordBytes: 65536, maxTotalBytes: 8 * 1024 * 1024 })
    for (const id of this.disk.ids()) {
      try { const record = this.disk.read(id); if (record.id !== id) throw new Error('ID mismatch'); this.records.set(id, record) }
      catch { this.damaged.push(id) }
    }
  }
  list(profileId: string) { z.enum(profileIds).parse(profileId); return structuredClone([...this.records.values()].filter(record => record.profileId === profileId)) }
  get(profileId: string, id: string): IntegrationConnection {
    z.enum(profileIds).parse(profileId); z.uuid().parse(id)
    const record = this.records.get(id)
    if (!record || record.profileId !== profileId) throw new Error('Интеграция недоступна этому профилю.')
    return structuredClone(record)
  }
  save(value: unknown) {
    const record = integrationConnectionSchema.parse(value), old = this.records.get(record.id)
    assertNoObviousSecrets(record)
    if (this.damaged.includes(record.id)) throw new Error('Сначала восстановите повреждённую запись; создайте новое подключение.')
    if (old && (old.profileId !== record.profileId || old.revision !== record.revision)) throw new Error('Подключение изменено другим окном или принадлежит другому профилю.')
    if (!old && record.revision !== 0) throw new Error('Некорректная ревизия нового подключения.')
    const next = { ...record, revision: record.revision + 1 }
    this.disk.write(record.id, next, old ? 'replace' : 'create')
    this.generations.get(record.id)?.abort(new Error('Настройки или разрешения интеграции изменились.'))
    this.generations.delete(record.id); this.records.set(record.id, next)
    return structuredClone(next)
  }
  capture(profileId: string, id: string) {
    const connection = this.get(profileId, id)
    if (!connection.enabled) throw new Error('Интеграция отключена. Разрешите её в настройках профиля.')
    let generation = this.generations.get(id)
    if (!generation) { generation = new AbortController(); this.generations.set(id, generation) }
    return { connection, signal: generation.signal }
  }
  remove(profileId: string, id: string) {
    this.get(profileId, id); this.disk.remove(id); this.records.delete(id)
    this.generations.get(id)?.abort(new Error('Интеграция удалена.')); this.generations.delete(id)
  }
  stop() { for (const generation of this.generations.values()) generation.abort(new Error('Сервис остановлен.')); this.generations.clear() }
}
