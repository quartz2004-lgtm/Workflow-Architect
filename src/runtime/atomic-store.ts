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

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { replaceFile } from './replace-file'

export interface StoreLimits { maxRecordBytes: number; maxTotalBytes: number; maxRecords: number }
const defaults: StoreLimits = { maxRecordBytes: 32 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024, maxRecords: 500 }
const uuid = z.uuid()

/** Single-writer process storage. Never use this module in the renderer bundle. */
export class AtomicStore<T> {
  readonly directory: string
  private readonly limits: StoreLimits
  constructor(directory: string, private readonly schema: z.ZodType<T>, limits: Partial<StoreLimits> = {}) {
    this.directory = resolve(directory)
    this.limits = { ...defaults, ...limits }
    for (const value of Object.values(this.limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Некорректная квота хранилища.')
    mkdirSync(this.directory, { recursive: true })
  }
  private path(id: string) { return join(this.directory, `${uuid.parse(id)}.json`) }
  ids(): string[] {
    return readdirSync(this.directory).filter(name => name.endsWith('.json') && uuid.safeParse(name.slice(0, -5)).success).map(name => name.slice(0, -5)).sort()
  }
  read(id: string): T {
    const path = this.path(id)
    if (statSync(path).size > this.limits.maxRecordBytes) throw new Error('Запись превышает допустимый размер.')
    return this.schema.parse(JSON.parse(readFileSync(path, 'utf8')))
  }
  usage(): number {
    // Include abandoned temporary files and damaged records: they still consume disk.
    return readdirSync(this.directory).reduce((sum, name) => sum + statSync(join(this.directory, name)).size, 0)
  }
  write(id: string, value: T, mode: 'create' | 'replace'): void {
    const path = this.path(id), present = existsSync(path)
    if (mode === 'create' && present) throw new Error('Запись с таким ID уже существует.')
    if (mode === 'replace' && !present) throw new Error('Запись для обновления не найдена.')
    const encoded = JSON.stringify(this.schema.parse(value))
    const bytes = Buffer.byteLength(encoded, 'utf8')
    if (bytes > this.limits.maxRecordBytes) throw new Error('Запись превышает допустимый размер.')
    if (!present && this.ids().length >= this.limits.maxRecords) throw new Error('Достигнут лимит записей. Удалите ненужную историю.')
    if (this.usage() + bytes > this.limits.maxTotalBytes) throw new Error('Недостаточно квоты для безопасного сохранения. Удалите ненужную историю.')
    const temporary = join(this.directory, `${id}.${randomUUID()}.tmp`)
    let descriptor: number | undefined
    try {
      descriptor = openSync(temporary, 'wx', 0o600)
      writeFileSync(descriptor, encoded, 'utf8')
      fsyncSync(descriptor)
      closeSync(descriptor); descriptor = undefined
      replaceFile(temporary, path)
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
      if (existsSync(temporary)) unlinkSync(temporary)
    }
  }
  remove(id: string): void { unlinkSync(this.path(id)) }
}
