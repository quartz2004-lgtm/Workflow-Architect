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

import { closeSync, existsSync, fstatSync, fsyncSync, lstatSync, openSync, readSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { relativeFileSchema } from './schema'
import { contentHash } from './effect-store'
import { replaceFile } from '../runtime/replace-file'

export const MAX_FILE_BYTES = 1_000_000

/** Permissions protect against graph input, not a hostile process running as the same OS user. */
export class ScopedFiles {
  readonly root: string
  constructor(root: string, private readonly allowWrites: boolean) {
    if (!isAbsolute(root)) throw new Error('Выберите абсолютный путь папки.')
    this.root = realpathSync(root)
    if (!lstatSync(this.root).isDirectory()) throw new Error('Выберите существующую папку.')
  }
  path(value: string, allowMissing = false): string {
    relativeFileSchema.parse(value)
    const target = resolve(this.root, value)
    this.assertInside(target)
    let current = this.root
    const parts = value.split('/')
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]!)
      if (!existsSync(current) && allowMissing && index === parts.length - 1) break
      const info = lstatSync(current)
      if (info.isSymbolicLink()) throw new Error('Ссылки и junction недоступны файловому подключению.')
      this.assertInside(realpathSync(current))
      if (index < parts.length - 1 && !info.isDirectory()) throw new Error('Родитель пути должен быть папкой.')
    }
    return target
  }
  private assertInside(target: string) {
    const child = relative(this.root, target)
    if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new Error('Путь выходит за разрешённую папку.')
  }
  read(path: string) {
    const target = this.path(path), fd = openSync(target, 'r')
    try {
      const info = fstatSync(fd)
      if (!info.isFile() || info.size > MAX_FILE_BYTES || info.nlink > 1) throw new Error('Разрешены текстовые файлы до 1 МБ без жёстких ссылок.')
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1)
      let length = 0, read = 0
      do { read = readSync(fd, buffer, length, buffer.length - length, null); length += read } while (read && length < buffer.length)
      if (length > MAX_FILE_BYTES) throw new Error('Файл вырос во время чтения.')
      const data = buffer.subarray(0, length)
      const content = new TextDecoder('utf-8', { fatal: true }).decode(data)
      return { path, content, hash: contentHash(content), bytes: data.length }
    } finally { closeSync(fd) }
  }
  list(path?: string) {
    const target = path === undefined ? this.root : this.path(path)
    const entries = readdirSync(target, { withFileTypes: true })
    if (entries.length > 1000) throw new Error('В папке более 1000 записей. Выберите вложенную папку.')
    return { entries: entries.filter(entry => !entry.isSymbolicLink()).map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' })).sort((a, b) => a.name.localeCompare(b.name)) }
  }
  write(path: string, content: string, expectedHash?: string) {
    if (!this.allowWrites) throw new Error('Запись в эту папку не разрешена.')
    const bytes = Buffer.byteLength(content)
    if (bytes > MAX_FILE_BYTES) throw new Error('Содержимое превышает 1 МБ.')
    const target = this.path(path, true), present = existsSync(target)
    if (present && (!expectedHash || this.read(path).hash !== expectedHash)) throw new Error('Файл изменён или не подтверждена его исходная версия. Прочитайте файл перед правкой.')
    if (!present && expectedHash) throw new Error('Исходный файл больше не существует.')
    // Synchronous bounded operations prevent another application job interleaving the CAS.
    const temporary = present ? join(dirname(target), `.wa-${randomUUID()}.tmp`) : target
    let fd: number | undefined
    try {
      fd = openSync(temporary, 'wx', 0o600)
      writeFileSync(fd, content, 'utf8'); fsyncSync(fd); closeSync(fd); fd = undefined
      if (present) {
        if (this.read(path).hash !== expectedHash) throw new Error('Файл изменился во время записи.')
        replaceFile(temporary, target)
      }
    } finally {
      if (fd !== undefined) closeSync(fd)
      if (present && existsSync(temporary)) unlinkSync(temporary)
    }
    return { path, hash: contentHash(content), bytes }
  }
}
