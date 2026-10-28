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

import { request } from 'node:http'
import { Readable } from 'node:stream'

/** Native loopback only. The stage signal owns the deadline, including waiting
 * for non-streaming inference headers; fetch's shorter default must not win. */
export const ollamaTransport: typeof fetch = async (input, init) => {
  if (typeof input !== 'string' || !init?.signal) throw new Error('Требуется локальный адрес и сигнал отмены.')
  const url = new URL(input)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash
    || !['/api/tags', '/api/show', '/api/chat'].includes(url.pathname)
    || Number(url.port) < 1024 || Number(url.port) > 65535
    || !['GET', 'POST'].includes(init.method ?? '') || (init.body !== undefined && typeof init.body !== 'string')) {
    throw new Error('Недопустимый запрос к локальной Ollama.')
  }
  const signal = AbortSignal.any([init.signal, AbortSignal.timeout(900000)])
  signal.throwIfAborted()
  return new Promise<Response>((resolve, reject) => {
    // No redirects, proxy, DNS lookup, cookies, retry or global dispatcher change.
    const outgoing = request(url, { method: init.method, headers: { 'Content-Type': 'application/json' }, signal, agent: false }, incoming => {
      const status = incoming.statusCode ?? 500
      if (status < 200 || status >= 300) {
        incoming.destroy()
        resolve(new Response(null, { status: status >= 200 && status <= 599 ? status : 502 }))
        return
      }
      if ([204, 205].includes(status)) { incoming.resume(); resolve(new Response(null, { status })); return }
      resolve(new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status }))
    })
    outgoing.once('error', reject)
    outgoing.end(init.body)
  })
}
