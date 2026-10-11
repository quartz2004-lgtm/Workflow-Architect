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
import { createNode, createProject } from '../domain/factories'
import { createEditor } from '../editor/session'
import { configureOperation } from './configure-operation'
import { createExecutionExample } from './example'
import { compileProject } from './compiler'
import { ExecutionRun } from './executor'

describe('Inspector operation configuration', () => {
  it('adds stable branch ports in one undoable command without destroying connections or descriptions', () => {
    const project = createProject(), logic = createNode('logic')
    logic.description = 'Keep this'; logic.config = { expression: 'legacy condition' }
    project.nodes = [logic]
    const editor = createEditor(project)
    const configured = configureOperation(logic, 'if')
    expect(configured.ports[1]!.id).toBe(logic.ports[1]!.id)
    expect(configured.ports).toHaveLength(3)
    expect(configured.description).toBe('Keep this')
    expect(configured.type === 'logic' && configured.config.expression).toBe('legacy condition')
    editor.execute({ type: 'configure-node', node: configured })
    editor.undo()
    expect(editor.projectStore.getState().project.nodes[0]!.operation).toBeUndefined()
    expect(editor.projectStore.getState().project.nodes[0]!.ports).toHaveLength(2)
    editor.redo()
    expect(editor.projectStore.getState().project.nodes[0]).toEqual(configured)
    expect(() => configureOperation(logic, 'artifact')).toThrow('несовместима')
  })
  it.each([true, false])('runs the shipped example (%s) through the compiler and executor', async approved => {
    const project = createExecutionExample()
    const result = compileProject(project, project.nodes[0]!.id)
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    const run = new ExecutionRun(result.plan, event => { if (event.kind === 'human-request') run.answer(event.request.id, true) })
    const outcome = await run.start({ approved, text: 'example' })
    expect(outcome.status).toBe('succeeded')
    expect(JSON.parse(outcome.artifacts[0]!.content)).toEqual({ result: approved ? 'EXAMPLE' : 'Нужна доработка' })
  })
})
