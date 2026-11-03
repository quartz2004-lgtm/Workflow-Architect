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
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { profileIds } from '../profiles/schema'
import { EditorialProcessService } from './process-service'
import { verifyProcessSnapshot } from './process-schema'

const roots: string[] = []
afterEach(() => {
  for (const folder of roots.splice(0)) {
    const target = resolve(folder)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('wa-process-')) throw new Error('Unsafe cleanup target')
    rmSync(target, { recursive: true, force: true })
  }
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wa-process-')); roots.push(root)
  return { root, service: new EditorialProcessService(root) }
}
const [owner, spouse] = profileIds
const example = { text: 'Выберите пару под привычную обувь.', sourceLabel: 'Synthetic test example', sourceDigest: 'a'.repeat(64), origin: 'development' }
const content = { title: 'Спокойный тон', instructions: { planner: '', writer: 'Пиши понятно.', reviewer: '' }, settings: { contextTokens: 32768, maxOutputTokens: 4096, temperature: 0.3, stageTimeoutMs: 600000 }, voiceExampleIds: [] as string[] }

describe('versioned process and explicit voice acceptance', () => {
  it('does not automatically accept a saved edit or activate a saved version', () => {
    const { service } = fixture()
    const library = service.addExample(owner, 0, example)
    const draft = library.examples[0]!
    expect(draft.status).toBe('pending')
    expect(() => service.saveVersion(owner, library.revision, { ...content, voiceExampleIds: [draft.id] })).toThrow('принятые')
    const version = service.saveVersion(owner, library.revision, content)
    expect(version.selectedVersionId).toBeNull()
    expect(service.capture(owner)).toBeNull()
  })
  it('requires approval of the exact example and rejects stale concurrent changes', () => {
    const { service } = fixture()
    const library = service.addExample(owner, 0, example), draft = library.examples[0]!
    expect(() => service.acceptExample(owner, 0, draft.id, draft.digest)).toThrow('изменились')
    expect(() => service.acceptExample(owner, 1, draft.id, 'b'.repeat(64))).toThrow('изменился')
    const accepted = service.acceptExample(owner, 1, draft.id, draft.digest)
    expect(accepted.examples[0]).toMatchObject({ status: 'accepted', digest: draft.digest })
    expect(accepted.examples[0]!.acceptedAt).toBeTruthy()
  })
  it('rolls back future selection without mutating versions or captured runs, across restart', () => {
    const { root, service } = fixture()
    let library = service.saveVersion(owner, 0, content)
    const first = library.versions[0]!
    library = service.selectVersion(owner, library.revision, first.id)
    const frozen = service.capture(owner)!
    library = service.saveVersion(owner, library.revision, { ...content, title: 'Новая версия', settings: { ...content.settings, temperature: 0.5 } })
    library = service.selectVersion(owner, library.revision, library.versions[1]!.id)
    const restarted = new EditorialProcessService(root)
    expect(restarted.capture(owner)!.version.number).toBe(2)
    expect(restarted.assertUsable(owner, frozen)).toEqual(frozen)
    restarted.selectVersion(owner, library.revision, first.id)
    expect(restarted.capture(owner)).toEqual(frozen)
    expect(restarted.read(owner).versions[0]).toEqual(first)
  })
  it('revokes future use while preserving stored text and versions as evidence', async () => {
    const { service } = fixture()
    let library = service.addExample(owner, 0, example)
    const draft = library.examples[0]!
    library = service.acceptExample(owner, library.revision, draft.id, draft.digest)
    library = service.saveVersion(owner, library.revision, { ...content, voiceExampleIds: [draft.id] })
    library = service.selectVersion(owner, library.revision, library.versions[0]!.id)
    const snapshot = service.capture(owner)!
    expect(await verifyProcessSnapshot(snapshot)).toEqual(snapshot)
    library = service.revokeExample(owner, library.revision, draft.id)
    expect(library.examples[0]!.text).toBe(example.text)
    expect(library.versions).toHaveLength(1)
    expect(() => service.capture(owner)).toThrow('отозван')
    expect(() => service.assertUsable(owner, snapshot)).toThrow('отозван')
    service.selectVersion(owner, library.revision, null)
    expect(service.capture(owner)).toBeNull()
  })
  it('isolates profiles and rejects another profile snapshot or edited storage', () => {
    const { root, service } = fixture()
    const library = service.saveVersion(owner, 0, content)
    service.selectVersion(owner, library.revision, library.versions[0]!.id)
    const snapshot = service.capture(owner)!
    expect(service.capture(spouse)).toBeNull()
    expect(() => service.assertUsable(spouse, snapshot)).toThrow('другому')
    snapshot.version.content.title = 'Changed'
    expect(() => service.assertUsable(owner, snapshot)).toThrow('изменён')
    const path = join(root, `${owner}.json`), raw = JSON.parse(readFileSync(path, 'utf8'))
    raw.versions[0].content.settings.temperature = 1.2
    writeFileSync(path, JSON.stringify(raw))
    expect(() => service.read(owner)).toThrow('повреждены')
  })
  it('does not accept evaluation holdout as a declared voice origin or inherited acceptance fields', () => {
    const { service } = fixture()
    expect(() => service.addExample(owner, 0, { ...example, origin: 'holdout' })).toThrow()
    expect(() => service.addExample(owner, 0, { ...example, status: 'accepted', acceptedAt: new Date().toISOString() })).toThrow()
    expect(service.read(owner).examples).toEqual([])
  })
})
