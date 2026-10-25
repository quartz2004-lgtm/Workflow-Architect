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
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MediaStore } from './media-store'
import { profileIds } from '../profiles/schema'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const image = { data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', width: 1, height: 1 }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wa-media-')); roots.push(root)
  const media = new MediaStore(root), id = media.add({ profileId: profileIds[0], label: 'Тестовое фото', sku: 'ITEM-A', sourceName: 'example.png', sourceHash: 'a'.repeat(64), image })
  return { root, media, id }
}
describe('profile-local immutable photographs', () => {
  it('preserves pixels and identity across restart and exposes only metadata in the list', () => {
    const f = fixture(), reader = new MediaStore(f.root)
    expect(reader.capture(profileIds[0], [f.id], 'item-a')[0]).toMatchObject({ id: f.id, image, sourceName: 'example.png' })
    expect(JSON.stringify(reader.list(profileIds[0]))).not.toContain(image.data)
    expect(reader.list(profileIds[1]).images).toEqual([])
    expect(() => reader.inspect(profileIds[1], f.id)).toThrow('профиле')
    expect(() => reader.change(profileIds[1], f.id, 'remove')).toThrow('профиле')
  })
  it('requires an explicit matching SKU, limits selection, and honours revocation without mutating captured evidence', () => {
    const f = fixture(), copy = f.media.capture(profileIds[0], [f.id], 'ITEM-A')
    expect(() => f.media.capture(profileIds[0], [f.id], '')).toThrow('SKU')
    expect(() => f.media.capture(profileIds[0], [f.id], 'ITEM-B')).toThrow('другому SKU')
    expect(() => f.media.capture(profileIds[0], [f.id, f.id], 'ITEM-A')).toThrow('разных')
    f.media.change(profileIds[0], f.id, 'enable', false)
    expect(() => f.media.capture(profileIds[0], [f.id], 'ITEM-A')).toThrow('отозван')
    f.media.change(profileIds[0], f.id, 'remove')
    expect(copy[0]!.image).toEqual(image)
    expect(f.media.list(profileIds[0]).images).toEqual([])
  })
  it('rejects changed pixels on reading and reports corrupt records instead of using them', () => {
    const f = fixture(), path = join(f.root, `${f.id}.json`), record = JSON.parse(readFileSync(path, 'utf8'))
    record.image.data = record.image.data.replace('CAQAAAC1', 'CAQAAAC2')
    writeFileSync(path, JSON.stringify(record))
    expect(() => f.media.capture(profileIds[0], [f.id], 'ITEM-A')).toThrow('целостность')
    expect(f.media.list(profileIds[0])).toEqual({ images: [], damaged: 1 })
  })
})
