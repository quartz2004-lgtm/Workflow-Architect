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

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { AtomicStore } from './atomic-store'

const schema = z.strictObject({ version: z.literal('0.3.1'), status: z.enum(['waiting', 'cancelled']), text: z.string() })
const directories: string[] = []
function directory() { const path = mkdtempSync(join(tmpdir(), 'workflow-runtime-test-')); directories.push(path); return path }
afterEach(() => {
  for (const path of directories.splice(0)) {
    if (!resolve(path).startsWith(resolve(tmpdir()) + '\\workflow-runtime-test-') && !resolve(path).startsWith(resolve(tmpdir()) + '/workflow-runtime-test-')) throw new Error('Unsafe test cleanup')
    rmSync(path, { recursive: true, force: true })
  }
})
const waiting = { version: '0.3.1', status: 'waiting', text: 'Контрольная точка' } as const
describe('runtime atomic storage on disk', () => {
  it('survives reopening and preserves a durable cancellation', () => {
    const path = directory(), id = randomUUID(), store = new AtomicStore(path, schema)
    store.write(id, waiting, 'create')
    expect(new AtomicStore(path, schema).read(id)).toEqual(waiting)
    store.write(id, { ...waiting, status: 'cancelled' }, 'replace')
    expect(new AtomicStore(path, schema).read(id).status).toBe('cancelled')
    expect(store.ids()).toEqual([id])
  })
  it('does not overwrite IDs on create, invent missing records on replace, or traverse paths', () => {
    const store = new AtomicStore(directory(), schema), id = randomUUID()
    store.write(id, waiting, 'create')
    expect(() => store.write(id, { ...waiting, status: 'cancelled' }, 'create')).toThrow('существует')
    expect(() => store.write(randomUUID(), waiting, 'replace')).toThrow('не найдена')
    expect(() => store.read('../outside')).toThrow()
    expect(() => store.remove('../outside')).toThrow()
    expect(store.read(id)).toEqual(waiting)
  })
  it('rejects invalid persisted data without deleting the diagnostic evidence', () => {
    const path = directory(), id = randomUUID(), store = new AtomicStore(path, schema)
    const invalid = '{"version":"future","status":"waiting","text":"old"}'
    writeFileSync(join(path, `${id}.json`), invalid)
    expect(() => store.read(id)).toThrow()
    expect(readFileSync(join(path, `${id}.json`), 'utf8')).toBe(invalid)
    writeFileSync(join(path, `${id}.json`), '{')
    expect(() => store.read(id)).toThrow()
  })
  it('reserves space for an atomic replacement and leaves the last good record intact on quota failure', () => {
    const path = directory(), id = randomUUID(), bytes = Buffer.byteLength(JSON.stringify(waiting))
    const store = new AtomicStore(path, schema, { maxTotalBytes: bytes * 2 - 1 })
    store.write(id, waiting, 'create')
    expect(() => store.write(id, waiting, 'replace')).toThrow('квоты')
    expect(new AtomicStore(path, schema).read(id)).toEqual(waiting)
  })
  it('counts abandoned temporary files but never restores them as acknowledged records', () => {
    const path = directory(), id = randomUUID(), bytes = Buffer.byteLength(JSON.stringify(waiting))
    writeFileSync(join(path, `${id}.abandoned.tmp`), JSON.stringify(waiting))
    const store = new AtomicStore(path, schema, { maxTotalBytes: bytes })
    expect(store.ids()).toEqual([])
    expect(store.usage()).toBe(bytes)
    expect(() => store.write(id, waiting, 'create')).toThrow('квоты')
  })
  it('enforces byte and record limits, then permits explicit history removal', () => {
    const path = directory(), id = randomUUID(), store = new AtomicStore(path, schema, { maxRecords: 1, maxRecordBytes: 150 })
    store.write(id, waiting, 'create')
    expect(() => store.write(randomUUID(), waiting, 'create')).toThrow('лимит записей')
    expect(() => store.write(id, { ...waiting, text: 'Я'.repeat(100) }, 'replace')).toThrow('размер')
    expect(store.read(id)).toEqual(waiting)
    store.remove(id)
    store.write(randomUUID(), waiting, 'create')
    expect(store.ids()).toHaveLength(1)
  })
})
