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

import { resolve4 } from 'node:dns/promises'
import { request } from 'node:https'
import { isIPv4 } from 'node:net'

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
export function isPublicIPv4(address: string): boolean {
  if (!isIPv4(address)) return false
  const [a, b, c] = address.split('.').map(Number) as [number, number, number, number]
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113)
}
export function externalUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port && url.port !== '443') throw new Error('Подключение требует HTTPS без пароля в URL и нестандартного порта.')
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.startsWith('[') || isIPv4(url.hostname) && !isPublicIPv4(url.hostname)) throw new Error('Локальные и служебные сетевые адреса недоступны HTTP-подключению.')
  return url
}
export function scopedUrl(base: string, path: string, query: Record<string, string>): URL {
  const root = externalUrl(base)
  if (root.search) throw new Error('Базовый адрес не должен содержать параметры запроса.')
  if (!root.pathname.endsWith('/')) root.pathname += '/'
  if (/\\|%2f|%5c|%2e/i.test(path)) throw new Error('Недопустимый путь запроса.')
  const target = new URL(path, root)
  externalUrl(target.href)
  if (target.origin !== root.origin || !target.pathname.startsWith(root.pathname)) throw new Error('Запрос выходит за адрес подключения.')
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value)
  return target
}
export interface NetworkRequest { url: URL; method: string; headers?: Record<string, string>; body?: string | Buffer; signal: AbortSignal; timeoutMs?: number }
export type JsonTransport = (options: NetworkRequest) => Promise<unknown>

/** DNS is resolved once, checked and pinned for the request. Redirects never inherit credentials. */
export const requestJson: JsonTransport = async ({ url, method, headers, body, signal, timeoutMs = 30000 }) => {
  externalUrl(url.href); signal.throwIfAborted()
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
  const addresses = isIPv4(url.hostname) ? [url.hostname] : await resolve4(url.hostname)
  boundedSignal.throwIfAborted()
  if (!addresses.length || addresses.some(address => !isPublicIPv4(address))) throw new Error('Адрес сервиса не прошёл проверку сетевых разрешений.')
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method, signal: boundedSignal, family: 4,
      lookup: (_host, _options, callback) => callback(null, addresses[0]!, 4),
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity', ...headers, ...(body === undefined ? {} : { 'Content-Length': Buffer.byteLength(body) }) },
    }, response => {
      const chunks: Buffer[] = []; let length = 0
      if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) { response.destroy(); reject(new Error(`Сервис вернул HTTP ${response.statusCode ?? 500}.`)); return }
      response.on('data', (chunk: Buffer) => {
        length += chunk.length
        if (length > MAX_RESPONSE_BYTES) { response.destroy(new Error('Ответ сервиса превышает 2 МБ.')); return }
        chunks.push(chunk)
      })
      response.on('error', () => reject(new Error('Не удалось прочитать ответ сервиса.')))
      response.on('end', () => {
        try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))) }
        catch { reject(new Error('Сервис вернул некорректный JSON.')) }
      })
    })
    // Do not propagate native errors: they can include a Telegram token embedded in its URL.
    req.on('error', () => reject(new Error(boundedSignal.aborted ? 'Сетевой запрос отменён или истекло время ожидания.' : 'Не удалось подключиться к сервису.')))
    req.end(body)
  })
}
