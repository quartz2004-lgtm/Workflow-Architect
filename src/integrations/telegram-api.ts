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
import { requestJson, type JsonTransport } from './network'

const userSchema = z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), is_bot: z.boolean(), username: z.string().optional() })
const messageSchema = z.object({ message_id: z.number().int(), from: userSchema.optional(), chat: z.object({ id: z.number().int(), type: z.string() }), text: z.string().max(4096).optional() })
export const telegramUpdateSchema = z.object({ update_id: z.number().int().nonnegative(), message: messageSchema.optional(), callback_query: z.object({ id: z.string().max(200), from: userSchema, data: z.string().max(64).optional(), message: messageSchema.optional() }).optional() })
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>

/** Token is resolved only for the current request and never exposed in result/error objects. */
export class TelegramApi {
  constructor(private readonly resolveToken: () => Promise<string>, private readonly transport: JsonTransport = requestJson) {}
  private async call(method: string, payload: Record<string, unknown>, signal: AbortSignal, timeoutMs = 30000): Promise<unknown> {
    const token = await this.resolveToken(); signal.throwIfAborted()
    if (!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token)) throw new Error('Сохранённое подключение не содержит корректный токен Telegram Bot API.')
    const response = await this.transport({ url: new URL(`https://api.telegram.org/bot${token}/${method}`), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal, timeoutMs })
    const envelope = z.object({ ok: z.boolean(), result: z.unknown().optional(), error_code: z.number().optional(), parameters: z.object({ retry_after: z.number().optional() }).optional() }).parse(response)
    if (!envelope.ok) throw new Error(`Telegram отклонил запрос (${envelope.error_code ?? 'ошибка'}).${envelope.parameters?.retry_after ? ` Повторите через ${envelope.parameters.retry_after} с.` : ''}`)
    return envelope.result
  }
  async me(signal: AbortSignal) { return userSchema.parse(await this.call('getMe', {}, signal)) }
  async webhook(signal: AbortSignal) { return z.object({ url: z.string() }).parse(await this.call('getWebhookInfo', {}, signal)) }
  async updates(offset: number, signal: AbortSignal) { return z.array(telegramUpdateSchema).max(100).parse(await this.call('getUpdates', { offset, timeout: 25, limit: 100, allowed_updates: ['message', 'callback_query'] }, signal, 35000)) }
  async message(chatId: string, text: string, signal: AbortSignal, buttons?: { text: string; callback_data: string }[][]) {
    const result = await this.call('sendMessage', { chat_id: chatId, text, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) }, signal)
    return z.object({ message_id: z.number().int() }).parse(result)
  }
  async callback(id: string, text: string, signal: AbortSignal) { await this.call('answerCallbackQuery', { callback_query_id: id, text }, signal); return { answered: true } }
  async document(chatId: string, filename: string, content: string, signal: AbortSignal, caption?: string) {
    const token = await this.resolveToken(); signal.throwIfAborted()
    if (!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token)) throw new Error('Некорректный токен Telegram.')
    if (/[\r\n"\\/]/.test(filename) || Buffer.byteLength(content) > 1_000_000) throw new Error('Некорректный файл Telegram.')
    const boundary = `wa-${randomUUID()}`
    const fields = Object.entries({ chat_id: chatId, ...(caption ? { caption } : {}) }).map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`).join('')
    const body = `${fields}--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${filename}"\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${content}\r\n--${boundary}--\r\n`
    const response = z.object({ ok: z.boolean(), result: z.object({ message_id: z.number().int() }).optional() }).parse(await this.transport({ url: new URL(`https://api.telegram.org/bot${token}/sendDocument`), method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body, signal }))
    if (!response.ok || !response.result) throw new Error('Telegram не подтвердил отправку файла. Проверьте чат перед повтором.')
    return response.result
  }
}
