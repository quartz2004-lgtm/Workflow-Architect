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

import { expect, it } from 'vitest'
import { createTemplate, templates } from './templates'
import { parseProject, deserializeProject, serializeProject } from './serialization'
import { validateProject } from '../validation/validate-project'
import { createEditor } from '../editor/session'

it('creates three independent portable templates without structural errors or implicit runtime/model choices', () => {
  for (const template of templates) {
    const first = createTemplate(template.id), second = createTemplate(template.id)
    expect(parseProject(first)).toEqual(first)
    expect(validateProject(first).filter(issue => issue.severity === 'error')).toEqual([])
    expect(first.nodes).toHaveLength(5)
    expect(first.edges).toHaveLength(4)
    expect(first.project.id).not.toBe(second.project.id)
    expect(first.nodes.every(node => second.nodes.every(other => other.id !== node.id))).toBe(true)
    expect(first.nodes.filter(n => n.type === 'agent').every(n => !n.config.model)).toBe(true)
    expect(deserializeProject(serializeProject(first))).toEqual(first)
  }
})

it('keeps old 0.1 settings valid and makes export defaults undoable and portable', () => {
  const editor = createEditor(createTemplate('research'))
  expect(editor.projectStore.getState().project.settings.exportDefault).toBeUndefined()
  editor.execute({ type: 'edit-settings', changes: { exportDefault: 'codex' } })
  const exported = deserializeProject(serializeProject(editor.projectStore.getState().project))
  expect(exported.settings.exportDefault).toBe('codex')
  editor.undo(); expect(editor.projectStore.getState().project.settings.exportDefault).toBeUndefined()
  editor.redo(); expect(editor.projectStore.getState().project.settings.exportDefault).toBe('codex')
})
