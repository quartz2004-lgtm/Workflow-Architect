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
  additions: z.array(z.strictObject({ afterBlockId: blockId.nullable(), text: z.string().trim().min(1).max(10000) })).max(4),
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
    const block = addition.afterBlockId === null ? null : blocks.get(addition.afterBlockId)
    if (block === undefined) throw new Error('Неизвестный блок для добавления.')
    const position = block ? block.end : text.length
    edits.push({ start: position, end: position, text: '\n\n' + addition.text + '\n\n', order: edits.length })
  }
  let result = text
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end || b.order - a.order)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  }
  if (result === text) throw new Error('Модель не внесла изменений в черновик.')
  if (result.length > 100000) throw new Error('Исправленный текст превышает допустимый размер.')
  return result
}
