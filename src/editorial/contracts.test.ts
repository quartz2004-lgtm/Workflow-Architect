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
import { defaultEditorialBudget, editorialBudgetSchema, normalizeEditorialTask } from './schema'
import { checkEditorialText } from './quality'
import { approveEditorialVersion, createEditorialVersion, isEditorialApprovalCurrent } from './versions'

const task = normalizeEditorialTask({ topic: 'Посадка белья', minimumWords: 100 })
const text = `# Посадка\n\n## Выбор\n${'Пример '.repeat(60)}\n\n## Примерка\n${'Проверка '.repeat(60)}`
const taskId = '00000000-0000-4000-8000-000000000001', id = '00000000-0000-4000-8000-000000000002'

describe('editorial input and bounded policy', () => {
  it('uses the same content for manual and Telegram, without leaking routing metadata', () => {
    expect(normalizeEditorialTask('Посадка')).toEqual(normalizeEditorialTask({ text: 'Посадка', chatId: 'private-chat', userId: 'private-user', source: 'telegram' }))
    expect(normalizeEditorialTask({ text: 'Добавь пример', previousArticle: text }).previousArticle).toBe(text)
  })
  it('rejects missing tasks and invalid limits rather than silently guessing', () => {
    expect(() => normalizeEditorialTask({ chatId: '123' })).toThrow()
    expect(() => normalizeEditorialTask({ text: 'Тема', minimumWords: -1 })).toThrow()
    expect(() => normalizeEditorialTask({ text: 'Тема', language: 'English' })).toThrow()
    expect(editorialBudgetSchema.safeParse({ ...defaultEditorialBudget, maxRevisions: 4 }).success).toBe(false)
    expect(editorialBudgetSchema.safeParse({ ...defaultEditorialBudget, timeoutMs: Infinity }).success).toBe(false)
  })
})

describe('formal checks stay separate from editorial judgement', () => {
  it('accepts formal structure without claiming semantic correctness', () => {
    const result = checkEditorialText({ task, text, finish: 'stop', allowedSourceIds: [], knowledgeGaps: [] })
    expect(result.issues).toEqual([])
    expect(result.words).toBeGreaterThanOrEqual(100)
    expect(result.sections).toBe(2)
  })
  it('retains truncation, short output, missing structure, unknown references and gaps', () => {
    const result = checkEditorialText({ task, text: 'Черновик [source:invented]', finish: 'length', allowedSourceIds: ['real'], knowledgeGaps: ['SKU не найден'] })
    expect(result.issues.map(issue => issue.code)).toEqual(['incomplete', 'volume', 'structure', 'source-reference', 'knowledge-gap'])
    expect(result.issues.every(issue => issue.origin === 'program')).toBe(true)
  })
})

describe('exact version approval', () => {
  const version = () => createEditorialVersion({ id, taskId, number: 1, createdAt: '2026-10-25T12:00:00.000Z', text, finish: 'stop', issues: [] })
  it('binds approval to task, version and exact bytes', async () => {
    const original = await version()
    const approval = await approveEditorialVersion(original, { taskId, versionId: id, digest: original.digest }, original.createdAt)
    expect(await isEditorialApprovalCurrent(original, approval)).toBe(true)
    expect(await isEditorialApprovalCurrent({ ...original, text: text + ' ' }, approval)).toBe(false)
    expect(await isEditorialApprovalCurrent({ ...original, id: taskId }, approval)).toBe(false)
    expect(await isEditorialApprovalCurrent({ ...original, taskId: id }, approval)).toBe(false)
    const edited = await createEditorialVersion({ ...original, id: taskId, number: 2, text: text + '\nПравка' })
    expect(await isEditorialApprovalCurrent(edited, approval)).toBe(false)
    expect(original.text).toBe(text)
  })
  it('does not allow an approval to bypass outstanding formal or editorial issues', async () => {
    const original = await version()
    const expected = { taskId, versionId: id, digest: original.digest }
    await expect(approveEditorialVersion({ ...original, finish: 'length' }, expected, original.createdAt)).rejects.toThrow('Требуется редактура')
    await expect(approveEditorialVersion({ ...original, issues: [{ code: 'editorial', origin: 'reviewer', message: 'Проверьте утверждение' }] }, expected, original.createdAt)).rejects.toThrow('Требуется редактура')
  })
})
