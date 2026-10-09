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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { createTemplate } from '../domain/templates'
import { createEditor } from '../editor/session'
import { previewPlan } from './plan'
import { createPreviewController } from './controller'

afterEach(() => vi.useRealTimers())
describe('architectural preview', () => {
  it('walks all branches and cycles once, excludes notes/disabled nodes and visits nested graphs', () => {
    const project = createProject(), a = createNode('trigger'), b = createNode('concept'), c = createNode('concept'), wrapper = createNode('subworkflow'), note = createNode('note'), disabled = createNode('agent'), nested = createNode('concept')
    if (wrapper.type !== 'subworkflow') throw new Error('factory')
    const id = createId(); wrapper.config.subworkflowId = id; disabled.status = 'disabled'
    project.nodes.push(a, b, c, wrapper, note, disabled)
    project.subworkflows.push({ id, title: 'Nested', description: '', ports: [], nodes: [nested], edges: [], groups: [] })
    project.edges.push(createEdge(a.id, b.id), createEdge(a.id, c.id), createEdge(b.id, a.id), createEdge(c.id, wrapper.id))
    const plan = previewPlan(project, null)
    expect(plan.map(step => step.nodeId)).toEqual([a.id, b.id, c.id, wrapper.id, nested.id])
    expect(plan[0]!.branch).toBe(true)
    expect(plan[1]!.viaEdgeIds).toEqual([project.edges[0]!.id])
    expect(plan.at(-1)!.graphId).toBe(id)
  })
  it('supports timed and manual viewing, pauses reduced motion and never touches project/history', () => {
    vi.useFakeTimers()
    const editor = createEditor(createTemplate('research')), before = editor.projectStore.getState()
    editor.preview.start(before.project, null, true)
    expect(editor.preview.store.getState().status).toBe('paused')
    vi.advanceTimersByTime(2000); expect(editor.preview.store.getState().index).toBe(0)
    editor.preview.step(); expect(editor.preview.store.getState().index).toBe(1)
    editor.preview.resume(); vi.advanceTimersByTime(850); expect(editor.preview.store.getState().index).toBe(2)
    editor.preview.pause(); vi.advanceTimersByTime(2000); expect(editor.preview.store.getState().index).toBe(2)
    editor.preview.resume(); vi.advanceTimersByTime(5000); expect(editor.preview.store.getState().status).toBe('complete')
    expect(editor.projectStore.getState()).toBe(before)
    expect(editor.historyStore.getState().past).toHaveLength(0)
    editor.execute({ type: 'create-node', node: createNode() })
    expect(editor.preview.store.getState().open).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('reports empty graphs and blocks structural errors without scheduling any work', () => {
    vi.useFakeTimers()
    const project = createProject(), controller = createPreviewController()
    controller.start(project, null)
    expect(controller.store.getState().message).toContain('Добавьте')
    project.edges.push(createEdge(createId(), createId()))
    controller.start(project, null)
    expect(controller.store.getState().status).toBe('blocked')
    expect(vi.getTimerCount()).toBe(0)
  })
})
