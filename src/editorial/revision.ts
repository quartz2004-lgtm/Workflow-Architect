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

const blockId = z.string().regex(/^p[0-9]+$/)
export const editorialRevisionSchema = z.strictObject({
  baseVersionId: z.uuid(),
  replacements: z.array(z.strictObject({ blockId, text: z.string().max(10000) })).max(12),
  additions: z.array(z.strictObject({
    afterBlockId: blockId.nullable(),
    heading: z.strictObject({ level: z.number().int().min(2).max(6), title: z.string().trim().min(1).max(200).regex(/^[^#\r\n]+$/) }).nullable(),
    paragraphs: z.array(z.string().trim().min(1).max(5000)).min(1).max(8),
  })).max(4),
})

/** IDs are selectors within one immutable version, not persistent paragraph identities. */
export function editorialBlocks(text: string) {
  let offset = 0
  const blocks: { id: string; text: string; start: number; end: number }[] = []
  text.split(/(\r?\n[ \t]*\r?\n)/).forEach((part, index) => {
    if (index % 2 === 0 && part.trim()) blocks.push({ id: 'p' + blocks.length, text: part, start: offset, end: offset + part.length })
    offset += part.length
  })
  return blocks
}

const hasBody = (text: string) => Boolean(text.replace(/^#{1,6}[ \t]+[^\r\n]+/gm, '').trim())

export function revisionResponseSchema(text: string, versionId: string) {
  const anchors = editorialBlocks(text).filter(block => hasBody(block.text)).map(block => block.id)
  const afterBlockId = anchors.length ? z.enum(anchors).nullable() : z.null()
  return editorialRevisionSchema.extend({
    baseVersionId: z.literal(versionId),
    additions: z.array(editorialRevisionSchema.shape.additions.element.extend({ afterBlockId })).max(4),
  })
}

/** Atomic literal edits. No fuzzy matching, executable patches or partial application. */
export function applyEditorialRevision(text: string, versionId: string, input: unknown): string {
  const patch = editorialRevisionSchema.parse(input)
  if (patch.baseVersionId !== versionId) throw new Error('Правки относятся к другой версии текста.')
  const blocks = new Map(editorialBlocks(text).map(block => [block.id, block]))
  const replaced = new Set<string>()
  const edits: { start: number; end: number; text: string; order: number }[] = []
  for (const replacement of patch.replacements) {
    const block = blocks.get(replacement.blockId)
    if (!block || replaced.has(block.id)) throw new Error('Неизвестный или повторный блок замены.')
    replaced.add(block.id)
    edits.push({ start: block.start, end: block.end, text: replacement.text, order: edits.length })
  }
  for (const addition of patch.additions) {
    if (addition.paragraphs.some(paragraph => /^\s{0,3}#{1,6}[ \t]/m.test(paragraph))) throw new Error('Заголовок добавления должен быть в heading, а paragraphs — содержать его текст.')
    const block = addition.afterBlockId === null ? null : blocks.get(addition.afterBlockId)
    if (block === undefined) throw new Error('Неизвестный блок для добавления.')
    if (block && !hasBody(block.text)) throw new Error('Нельзя вставлять новый фрагмент между заголовком и его содержанием. Выберите блок с текстом или конец статьи.')
    const position = block ? block.end : text.length
    const content = [
      ...(addition.heading ? ['#'.repeat(addition.heading.level) + ' ' + addition.heading.title] : []),
      ...addition.paragraphs,
    ].join('\n\n')
    edits.push({ start: position, end: position, text: '\n\n' + content + '\n\n', order: edits.length })
  }
  let result = text
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end || b.order - a.order)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  }
  if (result === text) throw new Error('Модель не внесла изменений в черновик.')
  if (result.length > 100000) throw new Error('Исправленный текст превышает допустимый размер.')
  return result
}
