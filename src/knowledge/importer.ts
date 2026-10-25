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

import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { knowledgeLimits, knowledgePathSchema, type KnowledgeDocument, type KnowledgeSnapshot } from './schema'

export class KnowledgeError extends Error {}
export const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
export function documentId(collectionId: string, path: string) {
  const stable = digest(`${collectionId}/${path}`)
  return `${stable.slice(0, 8)}-${stable.slice(8, 12)}-5${stable.slice(13, 16)}-8${stable.slice(17, 20)}-${stable.slice(20, 32)}`
}
const recommended = new Set(['KNOWLEDGE-VERSION.json', 'source/current/products-editorial.json', 'source/current/claims.json', 'source/current/care-rules-v1.json', 'source/current/CARE-v1.md', 'source/current/product-sizing-owner-facts.json', 'source/current/CONTENT-RULES.md', 'source/current/CONTENT-REVIEW.md', 'source/current/material-description-approved-v2.md', 'docs/SMM-EDITORIAL-v2.md', 'docs/CONTENT-DEPTH-v1.md', 'docs/CHANNELS-v1.md'])
const excludedPart = /(^[.]|archive|архив|secret|credential|token|password|private|personal|contact|контакт|персонал|commercial|коммерч|reviews|отзыв|evidence|заказ|orders|price)/i
export function allowedKnowledgePath(path: string) {
  if (!knowledgePathSchema.safeParse(path).success || path.split('/').some(part => excludedPart.test(part))) return false
  return /\.(md|json)$/i.test(path) && (['KNOWLEDGE-VERSION.json', 'START-HERE.md', 'CHANGELOG-KNOWLEDGE.md'].includes(path) || ['source/current/', 'source/knowledge/', 'docs/'].some(root => path.startsWith(root)))
}
export async function sourceRoot(path: string) {
  if (!isAbsolute(path) || path.startsWith('\\\\') || path.startsWith('//')) throw new KnowledgeError('Выберите локальную папку с абсолютным путём. Сетевые пути не поддерживаются.')
  const root = resolve(path)
  // Check every ancestor, including junctions, before following the root.
  let cursor = root
  while (true) {
    const stat = await lstat(cursor)
    if (stat.isSymbolicLink()) throw new KnowledgeError('Ссылки и junction-папки не импортируются. Выберите исходную папку.')
    const parent = resolve(cursor, '..'); if (parent === cursor) break; cursor = parent
  }
  if (!(await lstat(root)).isDirectory()) throw new KnowledgeError('Источник должен быть папкой.')
  // Windows may supply an 8.3 alias (RUNNER~1). Compare canonical paths on both
  // sides of the containment check, after rejecting symbolic ancestors.
  return realpath(root)
}
async function safeFile(root: string, path: string) {
  if (!allowedKnowledgePath(path)) throw new KnowledgeError(`Путь исключён из импорта: ${path}`)
  let cursor = root
  for (const part of path.split('/')) {
    cursor = join(cursor, part)
    if ((await lstat(cursor)).isSymbolicLink()) throw new KnowledgeError(`Ссылка исключена: ${path}`)
  }
  const actual = await realpath(cursor), local = relative(root, actual)
  if (local.startsWith('..') || isAbsolute(local)) throw new KnowledgeError('Файл находится вне разрешённой папки.')
  return actual
}
export async function scanSource(sourcePath: string) {
  const root = await sourceRoot(sourcePath), files: { path: string; recommended: boolean }[] = []
  let excluded = 0, visited = 0
  async function walk(path: string, depth: number) {
    if (depth > 5) { excluded++; return }
    let entries
    try { entries = await readdir(join(root, path), { withFileTypes: true }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    for (const entry of entries) {
      if (++visited > 4000) throw new KnowledgeError('Слишком много файлов. Выберите отдельную папку базы знаний.')
      const next = path ? `${path}/${entry.name}` : entry.name
      if (entry.isSymbolicLink() || excludedPart.test(entry.name)) { excluded++; continue }
      if (entry.isDirectory()) {
        if (next === 'source' || next === 'source/current' || next === 'source/knowledge' || next === 'docs' || next.startsWith('docs/') || next.startsWith('source/current/') || next.startsWith('source/knowledge/')) await walk(next, depth + 1)
        else excluded++
      } else if (entry.isFile() && allowedKnowledgePath(next)) files.push({ path: next, recommended: recommended.has(next) })
      else excluded++
    }
  }
  await walk('', 0)
  if (files.length > 600) throw new KnowledgeError('В базе больше 600 доступных документов. Выделите меньшую коллекцию.')
  return { sourcePath: root, files: files.sort((a, b) => a.path.localeCompare(b.path)), excluded }
}
function extractFacts(value: unknown): KnowledgeDocument['facts'] {
  const facts: KnowledgeDocument['facts'] = []
  function walk(item: unknown, depth: number) {
    if (depth > 24) throw new KnowledgeError('JSON слишком глубоко вложен.')
    if (Array.isArray(item)) { for (const child of item) walk(child, depth + 1); return }
    if (!item || typeof item !== 'object') return
    const record = item as Record<string, unknown>
    const text = (keys: string[], max: number) => { for (const key of keys) if (typeof record[key] === 'string') return record[key].slice(0, max); return null }
    const sku = text(['canonical_sku', 'sku'], 200), id = text(['id'], 200) ?? sku
    if (id) facts.push({ sourceId: id, sku, approval: text(['editorial_status', 'approval_status'], 500), scope: text(['usage_note', 'scope', 'applicability'], 2000) })
    if (facts.length > 2000) throw new KnowledgeError('Слишком много записей в одном документе.')
    for (const child of Object.values(record)) walk(child, depth + 1)
  }
  walk(value, 0); return facts
}
export function snapshotDigest(documents: KnowledgeDocument[]) {
  return digest(JSON.stringify(documents.map(document => [document.path, document.hash]).sort((a, b) => a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0)))
}
export function verifySnapshot(snapshot: KnowledgeSnapshot) {
  const paths = new Set<string>(), ids = new Set<string>(); let bytes = 0
  for (const doc of snapshot.documents) {
    if (!allowedKnowledgePath(doc.path) || paths.has(doc.path) || ids.has(doc.id)) throw new KnowledgeError('Недопустимый или повторный документ снимка.')
    paths.add(doc.path); ids.add(doc.id)
    if (digest(doc.content) !== doc.hash || Buffer.byteLength(doc.content, 'utf8') !== doc.bytes) throw new KnowledgeError('Контрольная сумма документа не совпадает. Снимок не изменён.')
    const facts = doc.format === 'json' ? extractFacts(JSON.parse(doc.content.replace(/^\uFEFF/, ''))) : []
    if (JSON.stringify(facts) !== JSON.stringify(doc.facts) || doc.format !== (doc.path.toLowerCase().endsWith('.json') ? 'json' : 'markdown')) throw new KnowledgeError('Метаданные документа не совпадают с содержимым.')
    bytes += doc.bytes
  }
  if (bytes > knowledgeLimits.snapshotBytes || snapshotDigest(snapshot.documents) !== snapshot.digest) throw new KnowledgeError('Нарушена целостность или квота снимка.')
  if (snapshot.sourceVersion !== sourceVersion(snapshot.documents)) throw new KnowledgeError('Версия базы не совпадает с содержимым.')
}
function sourceVersion(documents: KnowledgeDocument[]) {
  const manifest = documents.find(doc => doc.path === 'KNOWLEDGE-VERSION.json')
  const value: unknown = manifest ? JSON.parse(manifest.content.replace(/^\uFEFF/, '')) : undefined
  return value && typeof value === 'object' && 'version' in value && typeof value.version === 'string' ? value.version.slice(0, 200) || 'Не указана' : 'Не указана'
}
export async function importSnapshot(rootPath: string, paths: string[], collectionId: string): Promise<KnowledgeSnapshot> {
  const root = await sourceRoot(rootPath), documents: KnowledgeDocument[] = []; let bytes = 0
  for (const path of [...new Set(paths)].sort()) {
    let file: string
    try { file = await safeFile(root, path) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error }
    const before = await lstat(file)
    if (!before.isFile() || before.size > knowledgeLimits.documentBytes) throw new KnowledgeError(`Документ превышает 512 КБ или не является файлом: ${path}`)
    const buffer = await readFile(file)
    if (buffer.byteLength > knowledgeLimits.documentBytes) throw new KnowledgeError(`Документ слишком велик: ${path}`)
    let content: string
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer) }
    catch { throw new KnowledgeError(`Нужен UTF-8: ${path}`) }
    if (content.includes('\0')) throw new KnowledgeError(`Бинарное содержимое: ${path}`)
    const after = await lstat(file)
    if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) throw new KnowledgeError(`Файл изменился во время чтения: ${path}. Повторите просмотр.`)
    bytes += buffer.byteLength
    if (bytes > knowledgeLimits.snapshotBytes) throw new KnowledgeError('Снимок превышает 6 МБ. Уменьшите выбор документов.')
    let facts: KnowledgeDocument['facts'] = []
    if (path.toLowerCase().endsWith('.json')) {
      try { facts = extractFacts(JSON.parse(content.replace(/^\uFEFF/, ''))) }
      catch { throw new KnowledgeError(`Некорректный JSON или слишком сложная структура: ${path}`) }
    }
    documents.push({ id: documentId(collectionId, path), path, hash: digest(content), bytes: buffer.byteLength, format: path.toLowerCase().endsWith('.json') ? 'json' : 'markdown', content, facts })
  }
  if (!documents.length) throw new KnowledgeError('Нет доступных выбранных документов. Рабочий снимок сохранён.')
  return { schemaVersion: '0.5.2', id: randomUUID(), createdAt: new Date().toISOString(), digest: snapshotDigest(documents), sourceVersion: sourceVersion(documents), documents }
}
