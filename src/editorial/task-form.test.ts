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
import { resultTypes, taskFromForm } from './task-form'
import { editorialKinds } from './schema'

const input = { kind: 'article' as const, text: 'Тема', audience: 'Покупатели', minimumWords: 600, items: 5, previousArticle: '' }
describe('ordinary editorial task form', () => {
  it('covers every engine type and maps visible requirements without hidden article constraints', () => {
    expect(resultTypes.map(item => item.kind).sort()).toEqual([...editorialKinds].sort())
    for (const item of resultTypes) {
      const task = taskFromForm({ ...input, kind: item.kind, minimumWords: item.minimumWords, previousArticle: item.kind === 'revision' ? 'Исходный факт.' : '' })
      expect(task.schemaVersion).toBe('0.5.5')
      if (task.schemaVersion !== '0.5.5') throw new Error('Wrong version')
      expect(task.minimumSections).toBe(item.kind === 'article' ? 2 : 0)
      if (item.kind === 'short-block') expect(task).toMatchObject({ minimumWords: 100, maximumWords: 130 })
      if (['content-plan', 'reels'].includes(item.kind)) expect(task.requiredItems).toBe(5)
    }
  })
  it('reports understandable errors before submitting invalid work', () => {
    expect(() => taskFromForm({ ...input, text: ' ' })).toThrow('Опишите задачу')
    expect(() => taskFromForm({ ...input, audience: '' })).toThrow('для кого')
    expect(() => taskFromForm({ ...input, kind: 'revision' })).toThrow('исходный текст')
    expect(() => taskFromForm({ ...input, minimumWords: 599 })).toThrow('600')
    expect(() => taskFromForm({ ...input, kind: 'reels', items: 31 })).toThrow('от 1 до 30')
    expect(() => taskFromForm({ ...input, minimumWords: NaN })).toThrow('целым числом')
  })
})
