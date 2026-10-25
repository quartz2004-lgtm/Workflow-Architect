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
import { knowledgeSnapshotSchema, type KnowledgeDocument, type KnowledgeSnapshot } from './schema'
import { profileIds } from '../profiles/schema'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const contextRequestSchema = z.strictObject({
  profileId: z.enum(profileIds), runId: z.uuid(), task: z.string().min(1).max(24000),
  query: z.string().min(1).max(4000), sku: z.string().trim().min(1).max(200).optional(),
  sourceIds: z.array(z.string().min(1).max(200)).max(30).default([]),
  maxBytes: z.number().int().min(1024).max(96000), maxExcerpts: z.number().int().min(1).max(40).default(12),
})
export const contextExcerptSchema = z.strictObject({
  collectionId: z.uuid(), snapshotId: z.uuid(), snapshotDigest: hash, sourceVersion: z.string(),
  documentId: z.uuid(), documentHash: hash, path: z.string(), locator: z.string(),
  sourceIds: z.array(z.string()), skus: z.array(z.string()), content: z.string(),
})
export const contextPacketSchema = z.strictObject({
  schemaVersion: z.literal('0.5.3'), profileId: z.enum(profileIds), runId: z.uuid(),
  task: z.string(), query: z.string(), sku: z.string().optional(),
  excerpts: z.array(contextExcerptSchema),
  gaps: z.array(z.strictObject({ kind: z.enum(['missing-sku', 'missing-source', 'no-match', 'budget']), detail: z.string() })),
  budgetBytes: z.number().int().positive(),
})
export type ContextPacket = z.infer<typeof contextPacketSchema>
export type ContextExcerpt = z.infer<typeof contextExcerptSchema>
export type ContextRequest = z.input<typeof contextRequestSchema>
export interface ContextSource { collectionId: string; snapshot: KnowledgeSnapshot }
interface Fragment { locator: string; content: string; sourceIds: string[]; skus: string[] }
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е')
const words = (text: string) => [...new Set(normalize(text).match(/[\p{L}\p{N}_-]{3,}/gu) ?? [])]
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
const pointer = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1')
const skuKeys = new Set(['sku', 'canonical_sku', 'product_sku', 'skus', 'applies_to_skus'])
const idKeys = new Set(['id', 'source_id', 'claim_id', 'rule_id'])

/** Explicit identifiers only. Never infer a product from a name, colour or material. */
function identifiers(value: unknown): { sourceIds: string[]; skus: string[] } {
  const sourceIds = new Set<string>(), skus = new Set<string>()
  function visit(item: unknown) {
    if (Array.isArray(item)) { item.forEach(visit); return }
    if (!item || typeof item !== 'object') return
    for (const [key, child] of Object.entries(item)) {
      const target = skuKeys.has(key) ? skus : idKeys.has(key) ? sourceIds : undefined
      if (target) {
        if (typeof child === 'string') target.add(child)
        else if (Array.isArray(child)) child.filter((entry): entry is string => typeof entry === 'string').forEach(entry => target.add(entry))
      }
      visit(child)
    }
  }
  visit(value)
  return { sourceIds: [...sourceIds], skus: [...skus] }
}

/** Records and sections stay whole: a budget can omit a fact, never cut off its conditions. */
export function documentFragments(document: KnowledgeDocument): Fragment[] {
  if (document.format === 'markdown') {
    const lines = document.content.split('\n'), fragments: Fragment[] = [], headings: string[] = []
    let start = 0, current: string[] = [], parents: string[] = []
    const flush = () => {
      if (current.join('\n').trim()) fragments.push({ locator: `lines:${start + 1}-${start + current.length}`, content: [...parents, ...current].join('\n'), sourceIds: [], skus: [] })
    }
    lines.forEach((line, index) => {
      const heading = /^(#{1,6})\s+/.exec(line)
      if (heading) {
        flush(); start = index; current = []
        const depth = heading[1]!.length
        headings.length = Math.min(headings.length, depth - 1)
        parents = [...headings]; headings[depth - 1] = line
      }
      current.push(line)
    })
    flush(); return fragments
  }
  const parsed: unknown = JSON.parse(document.content), fragments: Fragment[] = []
  function visit(value: unknown, locator: string, ancestors: Record<string, unknown>[] = []) {
    if (Array.isArray(value)) { value.forEach((entry, index) => visit(entry, `${locator}/${index}`, ancestors)); return }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      const named = Object.keys(record).some(key => skuKeys.has(key) || idKeys.has(key))
      const branches = Object.entries(record).filter(([, child]) => child !== null && typeof child === 'object')
      if (!named && branches.length) {
        const metadata = Object.fromEntries(Object.entries(record).filter(([, child]) => child === null || typeof child !== 'object'))
        if (Object.keys(metadata).length) fragments.push({ locator: `${locator || '/'}/@metadata`, content: JSON.stringify(metadata), ...identifiers(metadata) })
        branches.forEach(([key, child]) => visit(child, `${locator}/${pointer(key)}`, [...ancestors, metadata])); return
      }
    }
    fragments.push({ locator: locator || '/', content: JSON.stringify(ancestors.length ? { sourceContext: ancestors, record: value } : value), ...identifiers(value) })
  }
  visit(parsed, ''); return fragments
}

/** Pure offline selection. Native caller must supply only authorised, verified immutable snapshots. */
export function buildContextPacket(input: ContextRequest, sources: readonly ContextSource[]): ContextPacket {
  const request = contextRequestSchema.parse(input)
  const packet: ContextPacket = { schemaVersion: '0.5.3', profileId: request.profileId, runId: request.runId,
    task: request.task, query: request.query, ...(request.sku ? { sku: request.sku } : {}), excerpts: [], gaps: [], budgetBytes: request.maxBytes }
  const tokens = words(request.query), requestedSku = request.sku && normalize(request.sku)
  const candidates: { excerpt: ContextExcerpt; score: number; exact: boolean }[] = []
  const foundIds = new Set<string>(); let foundSku = false
  for (const source of sources) {
    z.uuid().parse(source.collectionId)
    const snapshot = knowledgeSnapshotSchema.parse(source.snapshot)
    for (const document of snapshot.documents) for (const fragment of documentFragments(document)) {
      const skuMatch = !!requestedSku && fragment.skus.some(sku => normalize(sku) === requestedSku)
      // A record scoped to a different product is not evidence for the requested one.
      if (requestedSku && fragment.skus.length && !skuMatch) continue
      if (skuMatch) foundSku = true
      const idMatches = request.sourceIds.filter(id => fragment.sourceIds.includes(id))
      idMatches.forEach(id => foundIds.add(id))
      const haystack = normalize(`${document.path}\n${fragment.content}`)
      const lexical = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0)
      const exact = skuMatch || idMatches.length > 0
      if (!exact && !lexical) continue
      candidates.push({ score: Number(skuMatch) * 10000 + idMatches.length * 1000 + lexical, exact,
        excerpt: { collectionId: source.collectionId, snapshotId: snapshot.id, snapshotDigest: snapshot.digest, sourceVersion: snapshot.sourceVersion,
          documentId: document.id, documentHash: document.hash, path: document.path, ...fragment } })
    }
  }
  if (requestedSku && !foundSku) packet.gaps.push({ kind: 'missing-sku', detail: request.sku! })
  for (const id of request.sourceIds) if (!foundIds.has(id)) packet.gaps.push({ kind: 'missing-source', detail: id })
  if (!candidates.length) packet.gaps.push({ kind: 'no-match', detail: 'Подходящие выдержки не найдены. Не восполняйте отсутствующие факты догадками.' })
  candidates.sort((a, b) => b.score - a.score || a.excerpt.path.localeCompare(b.excerpt.path, 'en') || a.excerpt.locator.localeCompare(b.excerpt.locator, 'en') || a.excerpt.collectionId.localeCompare(b.excerpt.collectionId, 'en'))
  // Reserve a bounded omission notice before selecting any excerpts.
  const omission = { kind: 'budget' as const, detail: 'Часть найденных источников не помещается целиком. Увеличьте бюджет или уточните запрос; пакет неполон.' }
  if (bytes({ ...packet, gaps: [...packet.gaps, omission] }) > request.maxBytes) throw new Error('Задача и служебные данные превышают бюджет пакета источников.')
  let omitted = false
  for (const candidate of candidates) {
    const next = { ...packet, excerpts: [...packet.excerpts, candidate.excerpt], gaps: [...packet.gaps, omission] }
    if (packet.excerpts.length >= request.maxExcerpts || bytes(next) > request.maxBytes) { omitted = true; continue }
    packet.excerpts.push(candidate.excerpt)
  }
  if (omitted) packet.gaps.push(omission)
  return contextPacketSchema.parse(packet)
}
