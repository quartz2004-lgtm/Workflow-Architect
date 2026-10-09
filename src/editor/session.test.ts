import { describe, expect, it } from 'vitest'
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import type { EngineeringType, Group } from '../domain/schema'
import { createEditor } from './session'

const graph = () => {
  const p = createProject()
  const a = createNode(); const b = createNode()
  p.nodes.push(a, b)
  const edge = createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id)
  p.edges.push(edge)
  return { editor: createEditor(p), a, b, edge }
}
describe('command history', () => {
  it('preserves IDs, layout, content and edges through each conversion and undo', () => {
    const types: EngineeringType[] = ['agent', 'tool', 'trigger', 'logic', 'data', 'human', 'artifact', 'subworkflow']
    for (const target of types) {
      const { editor, a, edge } = graph()
      editor.execute({ type: 'edit-node', id: a.id, changes: { notes: 'Keep me', color: 'cyan', description: 'Intent' } })
      const before = editor.projectStore.getState().project.nodes[0]!
      editor.execute({ type: 'convert-node', id: a.id, target })
      const after = editor.projectStore.getState().project.nodes[0]!
      expect(after).toMatchObject({ ...before, type: target, config: {} })
      expect(editor.projectStore.getState().project.edges).toEqual([edge])
      editor.undo()
      expect(editor.projectStore.getState().project.nodes[0]).toEqual(before)
      expect(editor.projectStore.getState().project.subworkflows).toHaveLength(0)
      editor.redo()
      expect(editor.projectStore.getState().project.nodes[0]).toEqual(after)
    }
  })
  it('undoes deletion atomically with incident edges and group membership', () => {
    const { editor, a, b, edge } = graph()
    const group: Group = { id: createId(), title: 'Group', description: '', nodeIds: [a.id, b.id], collapsed: false, position: { x: 0, y: 0 }, size: { width: 600, height: 400 } }
    editor.execute({ type: 'group', group })
    editor.execute({ type: 'delete', nodeIds: [a.id], edgeIds: [] })
    expect(editor.projectStore.getState().project.edges).toHaveLength(0)
    expect(editor.projectStore.getState().project.groups[0]!.nodeIds).toEqual([b.id])
    editor.undo()
    expect(editor.projectStore.getState().project.nodes).toEqual([a, b])
    expect(editor.projectStore.getState().project.edges).toEqual([edge])
    expect(editor.projectStore.getState().project.groups[0]).toEqual(group)
    editor.execute({ type: 'move-group', id: group.id, position: { x: 100, y: 200 } })
    expect(editor.projectStore.getState().project.nodes.map(n => n.position)).toEqual([{ x: 100, y: 200 }, { x: 100, y: 200 }])
    editor.undo()
    expect(editor.projectStore.getState().project.nodes).toEqual([a, b])
    editor.execute({ type: 'ungroup', id: group.id })
    editor.undo()
    expect(editor.projectStore.getState().project.groups).toEqual([group])
  })
  it('records bulk movement and resize as one operation each, and truncates redo on edits', () => {
    const { editor, a, b } = graph()
    editor.execute({ type: 'move-nodes', positions: [a, b].map(n => ({ id: n.id, position: { x: 50, y: 60 } })) })
    expect(editor.historyStore.getState().past).toHaveLength(1)
    editor.undo()
    expect(editor.projectStore.getState().project.nodes).toEqual([a, b])
    editor.execute({ type: 'resize-node', id: a.id, size: { width: 400, height: 200 }, position: { x: -40, y: -20 } })
    expect(editor.historyStore.getState().future).toHaveLength(0)
    editor.undo()
    expect(editor.projectStore.getState().project.nodes[0]).toEqual(a)
  })
  it('rejects invalid commands atomically and keeps transient state out of history', () => {
    const { editor, a } = graph()
    const before = editor.projectStore.getState().project
    expect(() => editor.execute({ type: 'create-node', node: a })).toThrow()
    expect(() => editor.execute({ type: 'create-edge', edge: createEdge(a.id, createId()) })).toThrow()
    expect(editor.projectStore.getState().project).toBe(before)
    editor.selectionStore.setState({ nodeIds: [a.id] })
    editor.canvasStore.setState({ zoom: 0.5 })
    expect(editor.historyStore.getState().past).toHaveLength(0)
  })
  it('supports create, connect, rename and edge edits with redo', () => {
    const editor = createEditor()
    const a = createNode(); const b = createNode()
    editor.execute({ type: 'create-node', node: a }); editor.execute({ type: 'create-node', node: b })
    const edge = createEdge(a.id, b.id)
    editor.execute({ type: 'create-edge', edge })
    editor.execute({ type: 'edit-edge', id: edge.id, changes: { label: 'Review' } })
    editor.undo(); expect(editor.projectStore.getState().project.edges[0]!.label).toBe('')
    editor.redo(); expect(editor.projectStore.getState().project.edges[0]!.label).toBe('Review')
    editor.execute({ type: 'edit-node', id: a.id, changes: { title: 'Renamed' } })
    expect(editor.projectStore.getState().project.nodes[0]!.id).toBe(a.id)
  })
})
