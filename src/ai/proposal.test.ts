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
import { createProject } from '../domain/factories'
import { createEditor } from '../editor/session'
import { prepareProposal } from './proposal'

const node = (key: number, type: 'agent' | 'tool') => ({ key, type, title: type, description: '', role: 'Редактор', systemPrompt: 'Проверь текст' })
const proposal = { message: 'Предлагаю', questions: [], nodes: [node(0, 'agent'), node(1, 'tool')], edges: [{ source: 0, target: 1, type: 'tool-access' }] }
describe('reviewed graph proposal', () => {
  it('does not grant tools by default and applies the whole fragment as one undoable command', () => {
    const project = createProject(), before = structuredClone(project), editor = createEditor(project)
    const prepared = prepareProposal(proposal, project, null, 'qwen3:8b', false)
    expect(project).toEqual(before)
    expect(prepared.graph.nodes[0]?.config).toHaveProperty('toolIds', [])
    expect(prepared.grants).toEqual(['agent → tool'])
    editor.execute(prepared.command)
    expect(editor.projectStore.getState().project.nodes).toHaveLength(2)
    editor.undo(); expect(editor.projectStore.getState().project.nodes).toHaveLength(0)
    editor.redo(); expect(editor.projectStore.getState().project.nodes).toEqual(prepared.graph.nodes)
    const granted = prepareProposal(proposal, project, null, 'qwen3:8b', true)
    expect(granted.graph.nodes[0]?.config).toHaveProperty('toolIds', [granted.graph.nodes[1]!.id])
  })
  it('rejects injected permissions, duplicate references and cycles', () => {
    const project = createProject()
    expect(() => prepareProposal({ ...proposal, permissions: ['shell'] }, project, null, 'qwen3:8b', true)).toThrow()
    expect(() => prepareProposal({ ...proposal, nodes: [node(0, 'agent'), node(0, 'tool')] }, project, null, 'qwen3:8b', false)).toThrow('повторяющиеся')
    expect(() => prepareProposal({ ...proposal, edges: [{ source: 0, target: 1, type: 'flow' }, { source: 1, target: 0, type: 'flow' }] }, project, null, 'qwen3:8b', false)).toThrow('цикл')
  })
})
