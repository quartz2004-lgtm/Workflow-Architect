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

import type { JsonValue } from '../domain/execution-config'
import type { ActionName } from './schema'
import { z } from 'zod'
import { actionArgumentsSchemas } from './schema'

export function connectorContracts(action: ActionName) {
  const input = z.toJSONSchema(actionArgumentsSchemas[action]); delete input.$schema
  const output: Record<string, JsonValue> = action.startsWith('telegram.') ? { type: 'object', properties: { message_id: { type: 'integer' } }, required: ['message_id'] }
    : action === 'files.read' ? { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, hash: { type: 'string' }, bytes: { type: 'integer' } }, required: ['path', 'content', 'hash', 'bytes'] }
    : action === 'files.write' ? { type: 'object', properties: { path: { type: 'string' }, hash: { type: 'string' }, bytes: { type: 'integer' } }, required: ['path', 'hash', 'bytes'] }
    : action === 'files.list' ? { type: 'object', properties: { entries: { type: 'array', items: { type: 'object' } } }, required: ['entries'] }
    : action === 'mcp.call' ? { type: 'object', properties: { content: { type: 'array' }, isError: { type: 'boolean' } } } : {}
  return { input, output }
}

export const connectorCatalog: Record<ActionName, { version: '0.5'; title: string; description: string; fields: { key: string; label: string; value: JsonValue; optional?: boolean }[]; sample: JsonValue }> = {
  'http.request': { version: '0.5', title: 'HTTP / JSON запрос', description: 'JSON по HTTPS в пределах базового адреса подключения. Перенаправления запрещены; запись требует отдельного разрешения.', fields: [{ key: 'method', label: 'Метод', value: 'GET' }, { key: 'path', label: 'Путь относительно базового адреса', value: '' }, { key: 'query', label: 'Параметры запроса', value: {} }, { key: 'body', label: 'Тело JSON', value: {}, optional: true }], sample: { method: 'GET', path: 'articles', query: {} } },
  'files.read': { version: '0.5', title: 'Прочитать текстовый файл', description: 'UTF-8 файл до 1 МБ внутри разрешённой папки. Результат содержит content и hash для безопасной правки.', fields: [{ key: 'path', label: 'Путь файла', value: 'article.md' }], sample: { path: 'article.md' } },
  'files.write': { version: '0.5', title: 'Сохранить текстовый файл', description: 'Новый файл создаётся без перезаписи. Для изменения существующего передайте hash из результата чтения в expectedHash.', fields: [{ key: 'path', label: 'Путь файла', value: 'article.md' }, { key: 'content', label: 'Текст файла', value: '' }, { key: 'expectedHash', label: 'Хеш предыдущей версии', value: '', optional: true }], sample: { path: 'article.md', content: 'Текст статьи' } },
  'files.list': { version: '0.5', title: 'Список файлов', description: 'До 1000 записей выбранной папки. Ссылки и junction исключены.', fields: [{ key: 'path', label: 'Вложенная папка', value: '', optional: true }], sample: {} },
  'telegram.send-message': { version: '0.5', title: 'Telegram · отправить сообщение', description: 'Текст до 4096 символов в личный чат, привязанный к этому профилю.', fields: [{ key: 'chatId', label: 'ID привязанного чата', value: '' }, { key: 'text', label: 'Текст сообщения', value: '' }], sample: { chatId: '123456789', text: 'Статья готова' } },
  'telegram.send-document': { version: '0.5', title: 'Telegram · отправить файл', description: 'Текстовый файл до 1 МБ в привязанный личный чат.', fields: [{ key: 'chatId', label: 'ID привязанного чата', value: '' }, { key: 'filename', label: 'Имя файла', value: 'article.md' }, { key: 'content', label: 'Текст файла', value: '' }, { key: 'caption', label: 'Подпись', value: '', optional: true }], sample: { chatId: '123456789', filename: 'article.md', content: 'Текст статьи' } },
  'mcp.call': { version: '0.5', title: 'MCP · вызвать инструмент', description: 'Только явно разрешённые инструменты файлового сервера. Пути в arguments относительны разрешённой папке.', fields: [{ key: 'tool', label: 'Инструмент MCP', value: 'read_text_file' }, { key: 'arguments', label: 'Аргументы инструмента', value: { path: 'article.md' } }], sample: { tool: 'read_text_file', arguments: { path: 'article.md' } } },
}
