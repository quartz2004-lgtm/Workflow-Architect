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

import { expect, it } from 'vitest'
import { productCatalog } from './products'
import type { ContextSource } from './context'

const id = '00000000-0000-4000-8000-000000000001'
function source(value: unknown): ContextSource {
  return { collectionId: id, snapshot: { schemaVersion: '0.5.2', id, createdAt: '2026-10-25T00:00:00.000Z', digest: 'a'.repeat(64), sourceVersion: 'fixture-v1', documents: [{ id, path: 'source/current/products-editorial.json', hash: 'a'.repeat(64), bytes: 0, format: 'json', content: JSON.stringify(value), facts: [] }] } }
}
it('offers explicit product identities with display names, variants and snapshot provenance', () => {
  const result = productCatalog([source({ models: [{ canonical_sku: 'SKU-A', name: 'Бельё синее', colors: ['синий'], sizes: ['M'], private_note: 'not for selector' }] })])
  expect(result.products).toEqual([{ sku: 'SKU-A', name: 'Бельё синее', colors: ['синий'], sizes: ['M'], collectionId: id, snapshotId: id, documentId: id, sourceVersion: 'fixture-v1' }])
  expect(JSON.stringify(result)).not.toContain('private_note')
})
it('does not invent product IDs from names, generic claims or malformed records', () => {
  expect(productCatalog([source({ models: [{ name: 'No SKU' }, { canonical_sku: 'No name' }, { canonical_sku: 'A', name: 'Wrong colors', colors: 'blue' }], claims: [{ sku: 'A', text: 'Claim' }] })]).products).toEqual([])
  expect(productCatalog([source({ claims: [{ canonical_sku: 'A', name: 'Not a product catalogue' }] })]).products).toEqual([])
})
