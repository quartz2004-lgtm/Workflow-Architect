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

import { createHash, randomUUID } from 'node:crypto'
import { AtomicStore } from '../runtime/atomic-store'
import { imageEvidenceSchema, mediaRecordSchema, type MediaRecord, type MediaView } from './media-schema'
import { KnowledgeError } from './importer'

const digest = (data: string) => createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex')
function verifyPixels(record: MediaRecord) {
  const bytes = Buffer.from(record.image.data, 'base64')
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== record.image.width || bytes.readUInt32BE(20) !== record.image.height || digest(record.image.data) !== record.hash) throw new KnowledgeError('Нарушена целостность фотографии или её размеров.')
}
export class MediaStore {
  private readonly store: AtomicStore<MediaRecord>
  constructor(directory: string) {
    this.store = new AtomicStore(directory, mediaRecordSchema, { maxRecordBytes: 1024 * 1024, maxTotalBytes: 96 * 1024 * 1024, maxRecords: 128 })
  }
  private read(profileId: string, id: string) {
    const record = this.store.read(id)
    if (record.profileId !== profileId) throw new KnowledgeError('Фотография недоступна в этом профиле.')
    verifyPixels(record)
    return record
  }
  list(profileId: string) {
    const images: MediaView[] = []; let damaged = 0
    for (const id of this.store.ids()) {
      try {
        const candidate = this.store.read(id)
        if (candidate.profileId !== profileId) continue
        const { image, ...record } = this.read(profileId, id)
        images.push({ ...record, width: image.width, height: image.height })
      } catch { damaged++ }
    }
    return { images, damaged }
  }
  add(input: Omit<MediaRecord, 'id' | 'schemaVersion' | 'createdAt' | 'enabled' | 'hash'>) {
    const record = mediaRecordSchema.parse({ ...input, id: randomUUID(), schemaVersion: '0.5.3', createdAt: new Date().toISOString(), enabled: true, hash: digest(input.image.data) })
    verifyPixels(record)
    this.store.write(record.id, record, 'create')
    return record.id
  }
  inspect(profileId: string, id: string) { return this.read(profileId, id) }
  change(profileId: string, id: string, action: 'enable' | 'remove', enabled?: boolean) {
    const record = this.read(profileId, id)
    if (action === 'remove') this.store.remove(id)
    else this.store.write(id, { ...record, enabled: enabled === true }, 'replace')
  }
  assertAllowed(profileId: string, ids: readonly string[]) {
    for (const id of ids) if (!this.read(profileId, id).enabled) throw new KnowledgeError('Доступ к фотографии отозван. Запрос модели не выполнен.')
  }
  capture(profileId: string, ids: readonly string[], sku: string) {
    if (ids.length > 2 || new Set(ids).size !== ids.length) throw new KnowledgeError('Выберите не более двух разных фотографий.')
    if (ids.length && !sku.trim()) throw new KnowledgeError('Для фотографий укажите точный SKU товара в настройках Agent.')
    this.assertAllowed(profileId, ids)
    return ids.map(id => {
      const record = this.read(profileId, id)
      if (record.sku.normalize('NFKC').toLocaleLowerCase('ru') !== sku.trim().normalize('NFKC').toLocaleLowerCase('ru')) throw new KnowledgeError('Фотография относится к другому SKU. Проверьте выбранный товар.')
      return imageEvidenceSchema.parse({ id: record.id, label: record.label, sku: record.sku, sourceName: record.sourceName, sourceHash: record.sourceHash, hash: record.hash, image: record.image })
    })
  }
}
