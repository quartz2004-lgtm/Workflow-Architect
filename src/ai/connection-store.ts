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
import type { LocalConnection } from './schema'
import { OllamaProvider } from './ollama'
import type { ModelProvider } from './types'
import { storedConnectionSchema } from './protocol'

type StoredConnection = z.infer<typeof storedConnectionSchema>
export interface ConnectionState { connection: StoredConnection | null; problem: string }

/** Native owner only. Profile changes revoke already captured providers and active requests. */
export class ConnectionStore {
  private readonly disk: AtomicStore<StoredConnection>
  private connections = new Map<string, StoredConnection>()
  private problems = new Map<string, string>()
  private generations = new Map<string, AbortController>()
  constructor(directory: string, private readonly factory: (connection: LocalConnection) => ModelProvider = config => new OllamaProvider(config)) {
    this.disk = new AtomicStore(directory, storedConnectionSchema, { maxRecords: 2, maxRecordBytes: 4096, maxTotalBytes: 32768 })
    for (const id of this.disk.ids()) {
      try { const record = this.disk.read(id); if (record.profileId !== id) throw new Error('Неверный профиль подключения.'); this.connections.set(id, record) }
      catch { this.problems.set(id, 'Настройки модели повреждены. Исходная запись сохранена; повторное сохранение явно заменит её.') }
    }
  }
  state(profileId: string): ConnectionState {
    z.enum(profileIds).parse(profileId)
    return { connection: structuredClone(this.connections.get(profileId) ?? null), problem: this.problems.get(profileId) ?? '' }
  }
  save(profileId: string, configuration: LocalConnection, enabled: boolean): ConnectionState {
    const value = storedConnectionSchema.parse({ version: '0.4', profileId, enabled, configuration })
    this.disk.write(profileId, value, this.disk.ids().includes(profileId) ? 'replace' : 'create')
    this.generations.get(profileId)?.abort(new Error('Подключение модели изменено или отключено.'))
    this.generations.set(profileId, new AbortController())
    this.connections.set(profileId, value); this.problems.delete(profileId)
    return this.state(profileId)
  }
  resolve(profileId: string, model: string): ModelProvider {
    const record = this.state(profileId).connection
    if (!record?.enabled) throw new Error('В этом профиле локальная модель не подключена. Откройте настройки ИИ.')
    if (record.configuration.model !== model) throw new Error(`Модель Agent не совпадает с выбранной в профиле (${record.configuration.model}).`)
    let generation = this.generations.get(profileId)
    if (!generation) { generation = new AbortController(); this.generations.set(profileId, generation) }
    const provider = this.factory(record.configuration), captured = generation
    const guarded = async <T>(signal: AbortSignal, action: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      const combined = AbortSignal.any([signal, captured.signal])
      combined.throwIfAborted()
      const result = await action(combined)
      combined.throwIfAborted()
      return result
    }
    return { id: provider.id, signal: captured.signal, costPerMillionInput: provider.costPerMillionInput, costPerMillionOutput: provider.costPerMillionOutput,
      list: signal => guarded(signal, combined => provider.list(combined)),
      inspect: (name, signal) => { if (name !== model) return Promise.reject(new Error('Модель не разрешена этим подключением.')); return guarded(signal, combined => provider.inspect(name, combined)) },
      chat: (request, signal) => { if (request.model !== model) return Promise.reject(new Error('Модель не разрешена этим подключением.')); return guarded(signal, combined => provider.chat(request, combined)) },
    }
  }
  stop() { for (const generation of this.generations.values()) generation.abort(new Error('Сервис ИИ остановлен.')) }
}
