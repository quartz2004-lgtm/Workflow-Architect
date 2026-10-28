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

import { describe, expect, it } from 'vitest'
import { applyEditorialRevision, editorialBlocks, revisionResponseSchema } from './revision'

const id = '00000000-0000-4000-8000-000000000001'
const original = '# Тема\r\n\r\nТочный состав.\r\n\r\n## Выбор\r\nСовет.'
const addition = (afterBlockId: string | null, text: string) => ({ afterBlockId, heading: null, paragraphs: [text] })
const patch = { baseVersionId: id, replacements: [{ blockId: 'p1', text: 'Исправленный состав.' }], additions: [addition('p1', 'Дополнительный пример.')] }

describe('atomic version-bound editorial revisions', () => {
  it('excludes bare headings from model insertion choices and validates them again before applying', () => {
    const invalid = { baseVersionId: id, replacements: [], additions: [addition('p0', 'Текст')] }
    expect(revisionResponseSchema(original, id).safeParse(invalid).success).toBe(false)
    expect(() => applyEditorialRevision(original, id, invalid)).toThrow('между заголовком')
    expect(revisionResponseSchema(original, id).safeParse({ ...invalid, additions: [addition('p1', 'Текст')] }).success).toBe(true)
    expect(revisionResponseSchema('# Только заголовок', id).safeParse({ ...invalid, additions: [addition(null, 'Текст')] }).success).toBe(true)
  })
  it('preserves every untouched byte and applies an addition after the replaced block', () => {
    const result = applyEditorialRevision(original, id, patch)
    expect(result).toBe('# Тема\r\n\r\nИсправленный состав.\n\nДополнительный пример.\n\n\r\n\r\n## Выбор\r\nСовет.')
    expect(original).toContain('Точный состав.')
    expect(editorialBlocks(original).map(block => block.id)).toEqual(['p0', 'p1', 'p2'])
  })
  it('retains insertion order, including multiple additions at the same boundary', () => {
    expect(applyEditorialRevision('Основа', id, { baseVersionId: id, replacements: [], additions: [
      addition('p0', 'Первый'), addition('p0', 'Второй'),
    ] })).toBe('Основа\n\nПервый\n\n\n\nВторой\n\n')
  })
  it('can add text to an empty draft without inventing a block selector', () => {
    expect(applyEditorialRevision('', id, { baseVersionId: id, replacements: [], additions: [addition(null, 'Текст')] }).trim()).toBe('Текст')
  })
  it.each([
    { ...patch, baseVersionId: '00000000-0000-4000-8000-000000000002' },
    { ...patch, replacements: [{ blockId: 'p99', text: 'Новый' }] },
    { ...patch, replacements: [...patch.replacements, ...patch.replacements] },
    { ...patch, additions: [addition('p99', 'Новый')] },
    { baseVersionId: id, replacements: [], additions: [] },
  ])('rejects stale, unknown, conflicting or empty edits atomically', invalid => {
    expect(() => applyEditorialRevision(original, id, invalid)).toThrow()
    expect(original).toBe('# Тема\r\n\r\nТочный состав.\r\n\r\n## Выбор\r\nСовет.')
  })
  it('refuses to grow a version beyond the persistent text limit', () => {
    expect(() => applyEditorialRevision('x'.repeat(100000), id, { baseVersionId: id, replacements: [], additions: [addition(null, 'extra')] })).toThrow('размер')
  })
  it('inserts a complete section before the next original block', () => {
    const result = applyEditorialRevision(original, id, { baseVersionId: id, replacements: [], additions: [{ afterBlockId: 'p1', heading: { level: 2, title: 'Упаковка' }, paragraphs: ['Первый абзац.', 'Второй абзац.'] }] })
    expect(result).toContain('## Упаковка\n\nПервый абзац.\n\nВторой абзац.\n\n\r\n\r\n## Выбор')
  })
  it.each([
    { afterBlockId: 'p1', heading: { level: 2, title: 'Пусто' }, paragraphs: [] },
    { afterBlockId: 'p1', heading: null, paragraphs: ['   '] },
    { afterBlockId: 'p1', heading: null, paragraphs: ['## Отдельный заголовок'] },
    { afterBlockId: 'p1', heading: null, paragraphs: ['Текст\n\n### Скрытый заголовок'] },
  ])('rejects detached or empty heading additions atomically', invalid => {
    expect(() => applyEditorialRevision(original, id, { ...patch, additions: [invalid] })).toThrow()
    expect(original).toContain('Точный состав.')
  })
})
