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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { EffectStore, UnknownEffectError } from './effect-store'
import { IntegrationConnections } from './connection-store'
import { ScopedFiles } from './files'
import { isPublicIPv4, scopedUrl } from './network'
import { TelegramApi } from './telegram-api'
import { FilesystemMcp } from './mcp'
import { profileIds } from '../profiles/schema'

const directories: string[] = []
function directory() { const path = mkdtempSync(join(tmpdir(), 'wa-integrations-')); directories.push(path); return path }
afterEach(() => { for (const path of directories.splice(0)) { if (!resolve(path).startsWith(`${resolve(tmpdir())}${sep}wa-integrations-`)) throw new Error('Unsafe cleanup'); rmSync(path, { recursive: true, force: true }) } })
describe('durable external effects', () => {
  it('coalesces concurrent requests and reuses acknowledged results after restart', async () => {
    const path = directory(), store = new EffectStore(path), action = vi.fn(async () => ({ message: 7 }))
    const results = await Promise.all([store.perform(profileIds[0], 'event:1', { b: 2, a: 1 }, action), store.perform(profileIds[0], 'event:1', { a: 1, b: 2 }, action)])
    expect(results).toEqual([{ message: 7 }, { message: 7 }]); expect(action).toHaveBeenCalledTimes(1)
    await expect(new EffectStore(path).perform(profileIds[0], 'event:1', { a: 1, b: 2 }, action)).resolves.toEqual({ message: 7 })
    expect(action).toHaveBeenCalledTimes(1)
    await expect(store.perform(profileIds[0], 'event:1', { a: 2 }, action)).rejects.toThrow('другими параметрами')
  })
  it('never replays a remote operation after an ambiguous transport failure', async () => {
    const path = directory(), store = new EffectStore(path), action = vi.fn(async () => { throw new Error('connection lost after send') })
    await expect(store.perform(profileIds[0], 'event:1', {}, action)).rejects.toThrow('connection lost')
    await expect(new EffectStore(path).perform(profileIds[0], 'event:1', {}, action)).rejects.toBeInstanceOf(UnknownEffectError)
    expect(action).toHaveBeenCalledTimes(1)
    await expect(store.perform(profileIds[1], 'event:1', {}, async () => 'other profile')).resolves.toBe('other profile')
  })
  it('records the pending state before invoking an external effect', async () => {
    const path = directory(), store = new EffectStore(path)
    await store.perform(profileIds[0], 'pending', {}, async () => {
      await expect(new EffectStore(path).perform(profileIds[0], 'pending', {}, async () => 'duplicate')).rejects.toBeInstanceOf(UnknownEffectError)
      return 'done'
    })
  })
})
describe('native connection permissions', () => {
  it('isolates profiles, enforces revisions and revokes captured grants', () => {
    const path = directory(), store = new IntegrationConnections(path), id = randomUUID()
    const record = store.save({ version: '0.5', id, profileId: profileIds[0], label: 'Articles', enabled: true, revision: 0, settings: { kind: 'local-files', root: path, allowWrites: false } })
    const captured = store.capture(profileIds[0], id)
    expect(() => store.capture(profileIds[1], id)).toThrow('профилю')
    expect(store.list(profileIds[1])).toEqual([])
    store.save({ ...record, enabled: false })
    expect(captured.signal.aborted).toBe(true)
    expect(() => store.save(record)).toThrow('другим окном')
    expect(() => new IntegrationConnections(path).capture(profileIds[0], id)).toThrow('отключена')
  })
})
describe('scoped article files', () => {
  it('permits Unicode filenames with spaces and requires a matching content hash to edit', () => {
    const files = new ScopedFiles(directory(), true), path = 'Моя статья.md'
    const created = files.write(path, 'Первая версия')
    expect(files.read(path).content).toBe('Первая версия')
    expect(() => files.write(path, 'Overwrite')).toThrow('исходная')
    files.write(path, 'Правки', created.hash)
    expect(() => files.write(path, 'Stale', created.hash)).toThrow('исходная')
    expect(files.read(path).content).toBe('Правки')
  })
  it('rejects traversal, Windows device paths, outside junctions, binary and oversized content', () => {
    const root = directory(), outside = directory(), files = new ScopedFiles(root, true)
    for (const path of ['../outside', '/absolute', 'x/../../outside', 'C:/file', 'file:stream', 'NUL.txt', 'file.', 'x\\file']) expect(() => files.write(path, 'bad')).toThrow()
    symlinkSync(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => files.write('escape/file.md', 'bad')).toThrow('junction')
    writeFileSync(join(root, 'binary'), Buffer.from([255, 254, 255])); expect(() => files.read('binary')).toThrow()
    expect(() => files.write('large.md', 'Я'.repeat(600000))).toThrow('1 МБ')
    expect(() => new ScopedFiles(root, false).write('new.md', '')).toThrow('не разрешена')
    mkdirSync(join(root, 'articles')); expect(files.list().entries.some(entry => entry.name === 'escape')).toBe(false)
  })
})
describe('HTTP and Telegram boundaries', () => {
  it('rejects private DNS addresses, redirect-style paths and base path escapes', () => {
    for (const ip of ['127.0.0.1', '10.1.1.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '198.18.0.1']) expect(isPublicIPv4(ip)).toBe(false)
    expect(isPublicIPv4('8.8.8.8')).toBe(true)
    for (const path of ['https://other.example/', '//other.example/', '../outside', '%2e%2e/outside', '/other']) expect(() => scopedUrl('https://example.com/api/', path, {})).toThrow()
    expect(scopedUrl('https://example.com/api', 'articles', { q: 'слово' }).pathname).toBe('/api/articles')
  })
  it('resolves credentials per call and never repeats a failed message automatically', async () => {
    const token = '123456:abcdefghijklmnopqrstuvwxyz', resolveToken = vi.fn(async () => token), transport = vi.fn(async () => ({ ok: false, error_code: 429, description: token }))
    const api = new TelegramApi(resolveToken, transport)
    await expect(api.message('123', 'Текст', new AbortController().signal)).rejects.toThrow('429')
    expect(transport).toHaveBeenCalledTimes(1); expect(resolveToken).toHaveBeenCalledTimes(1)
    await expect(api.me(new AbortController().signal)).rejects.not.toThrow(token)
    expect(resolveToken).toHaveBeenCalledTimes(2)
  })
})

describe('official filesystem MCP server', () => {
  it('discovers real contracts, denies ungranted tools and reads only a permitted file', async () => {
    const root = directory(), mcp = new FilesystemMcp(resolve('node_modules/@modelcontextprotocol/server-filesystem/dist/index.js'))
    writeFileSync(join(root, 'article.md'), 'Статья для проверки MCP', 'utf8')
    const signal = AbortSignal.timeout(15000), settings = { kind: 'mcp-filesystem', root, tools: [] } as const
    const tools = await mcp.discover({ ...settings, tools: [] }, signal)
    const read = tools.find(tool => tool.name === 'read_text_file')!
    expect(read.schemaHash).toHaveLength(64)
    await expect(mcp.call({ ...settings, tools: [] }, 'read_text_file', { path: 'article.md' }, signal)).rejects.toThrow('не разрешён')
    const granted = { ...settings, tools: [{ name: read.name, schemaHash: read.schemaHash }] }
    expect(JSON.stringify(await mcp.call(granted, read.name, { path: 'article.md' }, signal))).toContain('Статья для проверки MCP')
    await expect(mcp.call(granted, read.name, { path: '../outside' }, signal)).rejects.toThrow()
    await expect(mcp.call({ ...settings, tools: [{ name: read.name, schemaHash: '0'.repeat(64) }] }, read.name, { path: 'article.md' }, signal)).rejects.toThrow('изменился')
  }, 20000)
})
