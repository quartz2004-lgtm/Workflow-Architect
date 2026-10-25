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
import { mkdtemp, mkdir, writeFile, rm, rename, readFile, symlink, realpath } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { profileIds } from '../profiles/schema'
import { KnowledgeService } from './service'
import { allowedKnowledgePath, scanSource } from './importer'
import { knowledgeCollectionSchema } from './schema'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'wa-knowledge-')); directories.push(root)
  const sourcePath = join(root, 'source-base'), storage = join(root, 'storage')
  await mkdir(join(sourcePath, 'source/current'), { recursive: true })
  await writeFile(join(sourcePath, 'KNOWLEDGE-VERSION.json'), JSON.stringify({ version: 'test-v1' }))
  await writeFile(join(sourcePath, 'source/current/products-editorial.json'), JSON.stringify({ models: [{ canonical_sku: 'TEST-SKU', name: 'Test model', scope: 'This model only', editorial_status: 'owner_approved', unknown: null }] }))
  await writeFile(join(sourcePath, 'source/current/CARE-v1.md'), '# Care\nNo heat.')
  const input = { profileId: profileIds[0], label: 'Test knowledge', sourcePath, selectedPaths: ['KNOWLEDGE-VERSION.json', 'source/current/products-editorial.json', 'source/current/CARE-v1.md'] }
  const service = new KnowledgeService(storage)
  const preview = await service.prepare(input), id = service.commit(profileIds[0], preview.token)
  return { root, sourcePath, storage, service, id, input, preview }
}
describe('local knowledge snapshots', () => {
  it.runIf(process.platform === 'win32')('accepts Windows short path aliases while preserving canonical containment', async () => {
    const f = await fixture()
    const shortPath = execFileSync('powershell.exe', ['-NoProfile', '-Command', '(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:WORKFLOW_TEST_SOURCE).ShortPath'], { env: { ...process.env, WORKFLOW_TEST_SOURCE: f.sourcePath }, encoding: 'utf8', windowsHide: true }).trim()
    const scan = await scanSource(shortPath)
    expect(scan.sourcePath).toBe(await realpath(f.sourcePath))
    const preview = await f.service.prepare({ ...f.input, sourcePath: shortPath })
    expect(preview.snapshot.documents).toHaveLength(3)
  })
  it.runIf(process.env.WORKFLOW_KNOWLEDGE_SOURCE)('imports the explicitly supplied real source without changing it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wa-knowledge-real-')); directories.push(root)
    const service = new KnowledgeService(root), scan = await scanSource(process.env.WORKFLOW_KNOWLEDGE_SOURCE!)
    const selectedPaths = scan.files.filter(file => file.recommended).map(file => file.path)
    const before = await Promise.all(selectedPaths.map(path => readFile(join(scan.sourcePath, path), 'utf8')))
    const preview = await service.prepare({ profileId: profileIds[0], label: 'SOAR acceptance', sourcePath: scan.sourcePath, selectedPaths })
    const id = service.commit(profileIds[0], preview.token)
    const restored = new KnowledgeService(root), view = (await restored.list(profileIds[0])).collections[0]!
    expect(view.id).toBe(id); expect(view.snapshots[0]!.documents.length).toBeGreaterThanOrEqual(8)
    expect(preview.snapshot.documents.find(doc => doc.path.endsWith('products-editorial.json'))!.facts.length).toBeGreaterThan(0)
    const after = await Promise.all(selectedPaths.map(path => readFile(join(scan.sourcePath, path), 'utf8')))
    expect(after).toEqual(before)
    console.log(JSON.stringify({ sourceVersion: preview.snapshot.sourceVersion, documents: selectedPaths.length, bytes: preview.snapshot.documents.reduce((sum, doc) => sum + doc.bytes, 0), digest: preview.snapshot.digest }))
  })
  it('survives restart without source; preserves source facts, hash and explicit unknowns', async () => {
    const f = await fixture()
    await rename(f.sourcePath, `${f.sourcePath}-offline`)
    const service = new KnowledgeService(f.storage), view = (await service.list(profileIds[0])).collections[0]!
    expect(view.sourceAvailable).toBe(false); expect(view.snapshots[0]!.sourceVersion).toBe('test-v1')
    const metadata = view.snapshots[0]!.documents.find(doc => doc.path.endsWith('products-editorial.json'))!
    const document = service.inspect(profileIds[0], f.id, view.snapshots[0]!.id, metadata.id)
    expect(document.facts).toEqual([{ sourceId: 'TEST-SKU', sku: 'TEST-SKU', approval: 'owner_approved', scope: 'This model only' }])
    expect(document.content).toContain('"unknown":null')
    expect(JSON.stringify(view)).not.toContain('No heat.')
  })
  it('updates changed and deleted files atomically; preview content is immutable and IDs survive deletion/readdition', async () => {
    const f = await fixture(), old = f.preview.snapshot
    await writeFile(join(f.sourcePath, 'source/current/CARE-v1.md'), '# Care\nChanged.')
    await rm(join(f.sourcePath, 'source/current/products-editorial.json'))
    const next = await f.service.prepare({ ...f.input, id: f.id, revision: 0 })
    expect(next.changed).toEqual(['source/current/CARE-v1.md']); expect(next.removed).toEqual(['source/current/products-editorial.json'])
    expect((await f.service.list(profileIds[0])).collections[0]!.snapshots[0]!.id).toBe(old.id)
    await writeFile(join(f.sourcePath, 'source/current/CARE-v1.md'), '# Care\nChanged after preview.')
    f.service.commit(profileIds[0], next.token)
    const doc = next.snapshot.documents.find(doc => doc.path.endsWith('.md'))!
    expect(f.service.inspect(profileIds[0], f.id, next.snapshot.id, doc.id).content).toBe('# Care\nChanged.')
    expect(doc.id).toBe(old.documents.find(doc => doc.path.endsWith('.md'))!.id)
    await writeFile(join(f.sourcePath, 'source/current/products-editorial.json'), '{}')
    const again = await f.service.prepare({ ...f.input, id: f.id, revision: 1 })
    expect(again.snapshot.documents.find(doc => doc.path.endsWith('products-editorial.json'))!.id).toBe(old.documents.find(doc => doc.path.endsWith('products-editorial.json'))!.id)
  })
  it('rejects invalid JSON, traversal, archives, links and oversized files without replacing a working collection', async () => {
    const f = await fixture()
    await writeFile(join(f.sourcePath, 'source/current/products-editorial.json'), '{ broken')
    await expect(f.service.prepare({ ...f.input, id: f.id, revision: 0 })).rejects.toThrow('JSON')
    for (const path of ['../secret.json', 'archive/current.json', 'source/current/.env.json', 'source/current/reviews.json', 'source/current/commercial-prices.json', 'source/current/a/../../b.json', 'source/current/x.ts']) expect(allowedKnowledgePath(path)).toBe(false)
    await mkdir(join(f.sourcePath, 'docs'))
    await symlink(join(f.sourcePath, 'source/current'), join(f.sourcePath, 'docs/link'), 'junction')
    expect((await scanSource(f.sourcePath)).files.some(file => file.path.includes('link'))).toBe(false)
    await expect(f.service.prepare({ ...f.input, selectedPaths: ['docs/link/CARE-v1.md'] })).rejects.toThrow('Ссылка')
    await writeFile(join(f.sourcePath, 'source/current/CARE-v1.md'), 'a'.repeat(513 * 1024))
    await expect(f.service.prepare({ ...f.input, selectedPaths: ['source/current/CARE-v1.md'] })).rejects.toThrow('512')
    expect((await f.service.list(profileIds[0])).collections[0]!.revision).toBe(0)
  })
  it('isolates profiles and rejects stale or revoked operations', async () => {
    const f = await fixture(), doc = f.preview.snapshot.documents[0]!
    expect((await f.service.list(profileIds[1])).collections).toEqual([])
    expect(() => f.service.inspect(profileIds[1], f.id, f.preview.snapshot.id, doc.id)).toThrow('профиле')
    expect(() => f.service.backup(profileIds[1], f.id)).toThrow('профиле')
    expect(() => f.service.change(profileIds[1], f.id, 0, 'remove')).toThrow('профиле')
    const next = await f.service.prepare({ ...f.input, id: f.id, revision: 0 })
    expect(() => f.service.commit(profileIds[1], next.token)).toThrow('устарел')
    f.service.change(profileIds[0], f.id, 0, 'enable', false)
    expect(() => f.service.commit(profileIds[0], next.token)).toThrow('изменилась')
    expect(() => f.service.inspect(profileIds[0], f.id, f.preview.snapshot.id, doc.id)).toThrow('отозван')
    expect(() => f.service.change(profileIds[0], f.id, 0, 'remove')).toThrow('изменилась')
  })
  it('restores verified backups into a separate disabled collection without trusting source paths; detects tampering', async () => {
    const f = await fixture(), backup = f.service.backup(profileIds[0], f.id)
    expect(JSON.stringify(backup)).not.toContain(f.sourcePath)
    const restoredId = f.service.restore(profileIds[1], backup)
    const restored = (await f.service.list(profileIds[1])).collections[0]!
    expect(restored).toMatchObject({ id: restoredId, sourcePath: '', enabled: false, revision: 0 })
    expect(restored.snapshots[0]!.digest).toBe(f.preview.snapshot.digest)
    expect(restored.snapshots[0]!.id).not.toBe(f.preview.snapshot.id)
    backup.snapshots[0]!.documents[0]!.content += 'tamper'
    expect(() => f.service.restore(profileIds[1], backup)).toThrow('сумма')
    expect((await f.service.list(profileIds[1])).collections).toHaveLength(1)
  })
  it('limits history and can prune or remove it without modifying source files', async () => {
    const f = await fixture()
    for (let revision = 0; revision < 4; revision++) { const next = await f.service.prepare({ ...f.input, id: f.id, revision }); f.service.commit(profileIds[0], next.token) }
    expect((await f.service.list(profileIds[0])).collections[0]!.snapshots).toHaveLength(3)
    f.service.change(profileIds[0], f.id, 4, 'prune')
    expect((await f.service.list(profileIds[0])).collections[0]!.snapshots).toHaveLength(1)
    f.service.change(profileIds[0], f.id, 5, 'remove')
    expect((await f.service.list(profileIds[0])).collections).toHaveLength(0)
    expect(await readFile(join(f.sourcePath, 'source/current/CARE-v1.md'), 'utf8')).toBe('# Care\nNo heat.')
  })
  it('reports damaged storage without overwriting it', async () => {
    const f = await fixture(), file = join(f.storage, `${f.id}.json`)
    const record = knowledgeCollectionSchema.parse(JSON.parse(await readFile(file, 'utf8')))
    record.snapshots[0]!.digest = '0'.repeat(64)
    await writeFile(file, JSON.stringify(record))
    expect(await f.service.list(profileIds[0])).toEqual({ collections: [], damaged: 1 })
    await expect(f.service.prepare({ ...f.input, id: f.id, revision: 0 })).rejects.toThrow('целостность')
    expect(await readFile(file, 'utf8')).toContain('0'.repeat(64))
  })
})
