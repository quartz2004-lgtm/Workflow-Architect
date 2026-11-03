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
import { createEditor } from '../editor/session'
import { createProject } from '../domain/factories'
import { updateRunDraft } from './draft-store'

describe('run draft lifetime', () => {
  it('keeps project drafts across panel closure and project switching without exporting them', () => {
    const first = createProject('Одинаковое имя'), second = createProject('Одинаковое имя')
    const editor = createEditor(first), original = JSON.stringify(first)
    updateRunDraft(editor.runDraftStore, first, { task: 'Приватное задание', previousArticle: 'Черновик', contractValues: { entry: { approved: 'false', count: '0' } } })
    editor.runtime.store.setState({ open: false })
    editor.replaceProject(second)
    updateRunDraft(editor.runDraftStore, second, { task: 'Другая задача' })
    editor.replaceProject(first)
    const drafts = editor.runDraftStore.getState().drafts
    expect(drafts[first.project.id]?.task).toBe('Приватное задание')
    expect(drafts[first.project.id]?.contractValues.entry).toEqual({ approved: 'false', count: '0' })
    expect(drafts[second.project.id]?.task).toBe('Другая задача')
    expect(JSON.stringify(editor.projectStore.getState().project)).toBe(original)
    expect(editor.historyStore.getState().past).toHaveLength(0)
    expect(createEditor(first).runDraftStore.getState().drafts).toEqual({})
  })
})
