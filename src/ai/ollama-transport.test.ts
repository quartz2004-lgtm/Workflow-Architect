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

import { createServer, type RequestListener } from 'node:http'
import { once } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { ollamaTransport } from './ollama-transport'

async function serve(listener: RequestListener, run: (url: string) => Promise<void>) {
  const server = createServer(listener)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local server address')
  try { await run(`http://127.0.0.1:${address.port}/api/chat`) }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
}

describe('stage-owned Ollama transport deadline', () => {
  it.skipIf(process.env.WORKFLOW_TEST_LONG_OLLAMA_TRANSPORT !== '1')('survives a real header delay longer than five minutes', async () => {
    await serve((request, response) => {
      request.resume()
      const timer = setTimeout(() => response.end('completed after five minutes'), 305000)
      response.once('close', () => clearTimeout(timer))
    }, async url => {
      const response = await ollamaTransport(url, { method: 'POST', body: '{}', signal: AbortSignal.timeout(325000) })
      expect(await response.text()).toBe('completed after five minutes')
    })
  }, 330000)

  it('waits for delayed headers without using fetch, preserving UTF-8 body bytes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected fetch'))
    try {
      await serve((request, response) => {
        request.resume()
        setTimeout(() => response.end('Привет'), 30)
      }, async url => {
        const response = await ollamaTransport(url, { method: 'POST', body: '{}', signal: AbortSignal.timeout(1000) })
        expect(await response.text()).toBe('Привет')
        expect(fetchSpy).not.toHaveBeenCalled()
      })
    } finally { fetchSpy.mockRestore() }
  })

  it('aborts a pending header wait without retrying the request', async () => {
    let requests = 0
    const controller = new AbortController()
    await serve(request => { requests++; request.resume(); controller.abort() }, async url => {
      await expect(ollamaTransport(url, { method: 'POST', signal: controller.signal })).rejects.toThrow()
      expect(requests).toBe(1)
    })
  })

  it('aborts an unfinished response body after headers arrived', async () => {
    await serve((request, response) => { request.resume(); response.write('part') }, async url => {
      const controller = new AbortController()
      const response = await ollamaTransport(url, { method: 'POST', signal: controller.signal })
      const body = response.text()
      controller.abort()
      await expect(body).rejects.toThrow()
    })
  })

  it('does not follow redirects or accept a non-loopback target', async () => {
    await serve((request, response) => { request.resume(); response.writeHead(302, { Location: 'https://example.com' }); response.end('private details') }, async url => {
      const response = await ollamaTransport(url, { method: 'GET', signal: AbortSignal.timeout(1000) })
      expect(response.status).toBe(302)
      expect(await response.text()).toBe('')
    })
    for (const url of ['https://example.com/api/chat', 'http://localhost:11434/api/chat', 'http://127.0.0.1:11434/other']) {
      await expect(ollamaTransport(url, { method: 'GET', signal: AbortSignal.timeout(1000) })).rejects.toThrow('Недопустимый')
    }
  })
})
