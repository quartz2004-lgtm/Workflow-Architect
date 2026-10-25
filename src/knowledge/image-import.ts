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

import { nativeImage } from 'electron'
import { open, lstat } from 'node:fs/promises'
import { basename } from 'node:path'
import { createHash } from 'node:crypto'
import { KnowledgeError } from './importer'
import { modelImageSchema } from '../ai/images'

/** Read dimensions before native decoding to bound decompression memory. */
export function imageDimensions(bytes: Buffer): { width: number; height: number } {
  let width = 0, height = 0
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new KnowledgeError('Некорректный заголовок PNG.')
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20)
    let offset = 8
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8)
      if (size > bytes.length - offset - 12) throw new KnowledgeError('Повреждённый PNG.')
      if (kind === 'acTL') throw new KnowledgeError('Анимированные PNG пока не поддерживаются.')
      offset += size + 12
      if (kind === 'IEND') break
    }
  } else if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) throw new KnowledgeError('Некорректная структура JPEG.')
      while (bytes[offset] === 255) offset++
      const marker = bytes[offset++]
      if (marker === undefined || marker === 218 || marker === 217) break
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue
      if (offset + 2 > bytes.length) break
      const size = bytes.readUInt16BE(offset)
      if (size < 2 || offset + size > bytes.length) throw new KnowledgeError('Повреждённый JPEG.')
      if ([192, 193, 194].includes(marker)) {
        if (size < 8) throw new KnowledgeError('Некорректный размер JPEG.')
        if (width || height) throw new KnowledgeError('JPEG содержит несколько заголовков кадра.')
        height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5)
      }
      offset += size
    }
  } else throw new KnowledgeError('Поддерживаются только настоящие JPEG и PNG, независимо от расширения файла.')
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16_000_000) throw new KnowledgeError('Размер фотографии должен быть не более 8192 px по стороне и 16 миллионов пикселей.')
  return { width, height }
}

export async function importImage(path: string) {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024) throw new KnowledgeError('Выберите обычный JPEG/PNG-файл размером не более 8 МБ.')
  const file = await open(path, 'r')
  let bytes: Buffer
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size > 8 * 1024 * 1024) throw new KnowledgeError('Фотография превышает 8 МБ.')
    bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, offset)
      if (!result.bytesRead) throw new KnowledgeError('Файл изменился во время чтения.')
      offset += result.bytesRead
    }
    const after = await file.stat()
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new KnowledgeError('Файл изменился во время чтения.')
  } finally { await file.close() }
  imageDimensions(bytes)
  const decoded = nativeImage.createFromBuffer(bytes)
  if (decoded.isEmpty()) throw new KnowledgeError('Не удалось прочитать изображение. Файл повреждён или использует неподдерживаемое кодирование.')
  const size = decoded.getSize()
  if (size.width * size.height > 16_000_000) throw new KnowledgeError('Декодированное изображение превышает квоту.')
  // Reconstruct from pixels: EXIF, comments, filename paths and original container metadata are not copied.
  for (const limit of [512, 384, 256]) {
    const scale = Math.min(1, limit / Math.max(size.width, size.height))
    const width = Math.max(1, Math.round(size.width * scale)), height = Math.max(1, Math.round(size.height * scale))
    const resized = decoded.resize({ width, height, quality: 'best' })
    const clean = nativeImage.createFromBitmap(resized.toBitmap(), { width, height, scaleFactor: 1 })
    const data = clean.toPNG().toString('base64')
    if (data.length <= 700000) return { sourceName: basename(path), sourceHash: createHash('sha256').update(bytes).digest('hex'), image: modelImageSchema.parse({ data, width, height }) }
  }
  throw new KnowledgeError('Не удалось уложить фотографию в безопасный размер. Уменьшите исходный файл.')
}
