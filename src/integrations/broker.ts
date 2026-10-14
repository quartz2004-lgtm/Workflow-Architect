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
import type { JsonValue } from '../domain/execution-config'
import { assertNoObviousSecrets } from '../domain/serialization'
import { assertValueBudget } from '../execution/values'
import { SecretRedactor } from '../credentials/redactor'
import { IntegrationConnections } from './connection-store'
import { EffectStore } from './effect-store'
import { actionArgumentsSchemas, actionConnectionKinds, type ActionName } from './schema'
import { ScopedFiles } from './files'
import { requestJson, scopedUrl, type JsonTransport } from './network'
import { TelegramApi } from './telegram-api'
import { FilesystemMcp } from './mcp'

export class IntegrationBroker {
  readonly redactor = new SecretRedactor()
  constructor(readonly connections: IntegrationConnections, readonly effects: EffectStore, readonly mcp: FilesystemMcp, private readonly resolveSecret: (profileId: string, id: string) => Promise<string>, private readonly transport: JsonTransport = requestJson) {}
  private async secret(profileId: string, id: string) {
    const secret = await this.resolveSecret(profileId, id)
    this.redactor.add(secret); return secret
  }
  safe(value: unknown): asserts value is JsonValue {
    assertValueBudget(value)
    if (this.redactor.contains(value)) throw new Error('Ответ содержит секрет подключения; передача в workflow и журнал запрещена.')
    assertNoObviousSecrets(value)
  }
  telegram(profileId: string, connectionId: string) {
    const { connection, signal } = this.connections.capture(profileId, connectionId)
    const settings = connection.settings
    if (settings.kind !== 'telegram') throw new Error('Требуется подключение Telegram.')
    return { api: new TelegramApi(() => this.secret(profileId, settings.credentialId), this.transport), signal }
  }
  async execute(profileId: string, connectionId: string, key: string, action: ActionName, value: JsonValue, abort: AbortSignal): Promise<JsonValue> {
    this.safe(value)
    const { connection, signal: grant } = this.connections.capture(profileId, connectionId), settings = connection.settings
    const signal = AbortSignal.any([abort, grant])
    if (settings.kind !== actionConnectionKinds[action]) throw new Error('Операция не соответствует типу подключения.')
    const args = actionArgumentsSchemas[action].parse(value)
    const perform = async (): Promise<JsonValue> => {
      signal.throwIfAborted()
      let result: unknown
      if (action === 'http.request' && settings.kind === 'http-json') {
        const input = actionArgumentsSchemas[action].parse(args)
        if (input.method !== 'GET' && !settings.allowWrites) throw new Error('Подключению разрешены только запросы GET.')
        const url = scopedUrl(settings.baseUrl, input.path, input.query), headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (settings.authentication !== 'none') {
          if (!settings.credentialId) throw new Error('Выберите сохранённый credential ID.')
          const secret = await this.secret(profileId, settings.credentialId)
          if (/[\r\n]/u.test(secret)) throw new Error('Секрет не может содержать переносы строк HTTP.')
          const header = settings.authentication === 'bearer' ? 'Authorization' : settings.headerName
          if (['host', 'content-length', 'connection', 'transfer-encoding', 'accept-encoding', 'content-type'].includes(header.toLowerCase())) throw new Error('Служебный HTTP-заголовок нельзя использовать для авторизации.')
          headers[header] = settings.authentication === 'bearer' ? `Bearer ${secret}` : secret
        }
        signal.throwIfAborted()
        result = await this.transport({ url, method: input.method, headers, signal, ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }) })
      } else if (settings.kind === 'local-files') {
        const files = new ScopedFiles(settings.root, settings.allowWrites)
        if (action === 'files.read') result = files.read(actionArgumentsSchemas[action].parse(args).path)
        else if (action === 'files.list') result = files.list(actionArgumentsSchemas[action].parse(args).path)
        else if (action === 'files.write') { const input = actionArgumentsSchemas[action].parse(args); result = files.write(input.path, input.content, input.expectedHash) }
      } else if (settings.kind === 'telegram') {
        const { api } = this.telegram(profileId, connectionId)
        if (action === 'telegram.send-message') { const input = actionArgumentsSchemas[action].parse(args); result = await api.message(input.chatId, input.text, signal) }
        else if (action === 'telegram.send-document') { const input = actionArgumentsSchemas[action].parse(args); result = await api.document(input.chatId, input.filename, input.content, signal, input.caption) }
      } else if (action === 'mcp.call' && settings.kind === 'mcp-filesystem') {
        const input = actionArgumentsSchemas[action].parse(args); result = await this.mcp.call(settings, input.tool, input.arguments, signal)
      }
      this.safe(result)
      return z.json().parse(result)
    }
    // Reads are not side effects; repeated reads may observe newer data and are explicit operations.
    const pureRead = action === 'files.read' || action === 'files.list' || action === 'http.request' && actionArgumentsSchemas['http.request'].parse(args).method === 'GET'
    try { return pureRead ? await perform() : await this.effects.perform(profileId, key, { connectionId, revision: connection.revision, action, args }, perform) }
    catch (error) {
      // eslint-disable-next-line preserve-caught-error -- Native causes may contain credentials; never retain them across the execution boundary.
      throw new Error(this.redactor.redact(error instanceof Error ? error.message : 'Ошибка подключения.'))
    }
  }
}
