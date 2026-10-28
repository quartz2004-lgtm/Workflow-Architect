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
import { applyEditorialRevision, editorialBlocks } from './revision'

const id = '00000000-0000-4000-8000-000000000001'
const original = '# Тема\r\n\r\nТочный состав.\r\n\r\n## Выбор\r\nСовет.'
const patch = { baseVersionId: id, replacements: [{ blockId: 'p1', text: 'Исправленный состав.' }], additions: [{ afterBlockId: 'p1', text: 'Дополнительный пример.' }] }

describe('atomic version-bound editorial revisions', () => {
  it('preserves every untouched byte and applies an addition after the replaced block', () => {
    const result = applyEditorialRevision(original, id, patch)
    expect(result).toBe('# Тема\r\n\r\nИсправленный состав.\n\nДополнительный пример.\n\n\r\n\r\n## Выбор\r\nСовет.')
    expect(original).toContain('Точный состав.')
    expect(editorialBlocks(original).map(block => block.id)).toEqual(['p0', 'p1', 'p2'])
  })
  it('retains insertion order, including multiple additions at the same boundary', () => {
    expect(applyEditorialRevision('Основа', id, { baseVersionId: id, replacements: [], additions: [
      { afterBlockId: 'p0', text: 'Первый' }, { afterBlockId: 'p0', text: 'Второй' },
    ] })).toBe('Основа\n\nПервый\n\n\n\nВторой\n\n')
  })
  it('can add text to an empty draft without inventing a block selector', () => {
    expect(applyEditorialRevision('', id, { baseVersionId: id, replacements: [], additions: [{ afterBlockId: null, text: '# Тема' }] }).trim()).toBe('# Тема')
  })
  it.each([
    { ...patch, baseVersionId: '00000000-0000-4000-8000-000000000002' },
    { ...patch, replacements: [{ blockId: 'p99', text: 'Новый' }] },
    { ...patch, replacements: [...patch.replacements, ...patch.replacements] },
    { ...patch, additions: [{ afterBlockId: 'p99', text: 'Новый' }] },
    { baseVersionId: id, replacements: [], additions: [] },
  ])('rejects stale, unknown, conflicting or empty edits atomically', invalid => {
    expect(() => applyEditorialRevision(original, id, invalid)).toThrow()
    expect(original).toBe('# Тема\r\n\r\nТочный состав.\r\n\r\n## Выбор\r\nСовет.')
  })
  it('refuses to grow a version beyond the persistent text limit', () => {
    expect(() => applyEditorialRevision('x'.repeat(100000), id, { baseVersionId: id, replacements: [], additions: [{ afterBlockId: null, text: 'extra' }] })).toThrow('размер')
  })
})
