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

import { z } from 'zod'
import type { ContextSource } from './context'

export const productOptionSchema = z.strictObject({
  sku: z.string().min(1).max(200), name: z.string().min(1).max(1000),
  colors: z.array(z.string().max(200)).max(100), sizes: z.array(z.string().max(200)).max(100),
  collectionId: z.uuid(), snapshotId: z.uuid(), sourceVersion: z.string(), documentId: z.uuid(),
})
export const productCatalogSchema = z.strictObject({ products: z.array(productOptionSchema).max(4000) })
export type ProductOption = z.infer<typeof productOptionSchema>

/** Catalogue identity comes only from explicit product records, never claims or inferred names. */
export function productCatalog(sources: readonly ContextSource[]): z.infer<typeof productCatalogSchema> {
  const products: ProductOption[] = []
  const record = z.object({ canonical_sku: z.string().trim().min(1).max(200), name: z.string().trim().min(1).max(1000), colors: z.array(z.string().max(200)).max(100).optional(), sizes: z.array(z.string().max(200)).max(100).optional() })
  for (const { collectionId, snapshot } of sources) for (const document of snapshot.documents) {
    if (document.format !== 'json') continue
    let content: unknown
    try { content = JSON.parse(document.content) } catch { continue }
    // Deliberately narrow catalog shape. A source reference mentioning a SKU is not a product.
    const parsed = z.object({ models: z.array(z.unknown()).max(4000) }).safeParse(content)
    if (!parsed.success) continue
    for (const item of parsed.data.models) {
      const entry = record.safeParse(item)
      if (!entry.success) continue
      products.push({ sku: entry.data.canonical_sku, name: entry.data.name, colors: entry.data.colors ?? [], sizes: entry.data.sizes ?? [], collectionId, snapshotId: snapshot.id, sourceVersion: snapshot.sourceVersion, documentId: document.id })
    }
  }
  return productCatalogSchema.parse({ products: products.sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.sku.localeCompare(b.sku)) })
}
