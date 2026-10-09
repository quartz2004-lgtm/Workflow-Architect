import { describe, expect, it } from 'vitest'
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { getGraph } from '../domain/graphs'
import { deserializeProject, serializeProject } from '../domain/serialization'
import { cloneClipboard, copySelection } from './clipboard'
import { makeGroup } from './organization'
import { createEditor } from './session'
import { validateProject } from '../validation/validate-project'
import { projectToCanvas, domainPosition } from '../canvas/adapter'
import { alignPosition } from '../canvas/alignment'
import { copy, duplicate, paste } from './actions'

function fixture() {
  const p = createProject()
  const nodes = [0, 1, 2, 3].map(index => createNode('concept', { x: index * 350, y: index * 10 }))
  p.nodes.push(...nodes)
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!; const b = nodes[i + 1]!
    p.edges.push({ ...createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id), label: `Edge ${i}`, contract: { kind: 'informal', description: `Contract ${i}` } })
  }
  const group = makeGroup(p, [nodes[1]!.id, nodes[2]!.id]); p.groups.push(group)
  return { p, nodes, group, editor: createEditor(p) }
}
describe('graph organization', () => {
  it('duplicates only the current selection without replacing the copy buffer', () => {
    const { editor, nodes } = fixture()
    editor.select([nodes[0]!.id]); copy(editor)
    editor.select(); duplicate(editor)
    expect(editor.getActiveGraph().nodes).toHaveLength(4)
    editor.select([nodes[3]!.id]); duplicate(editor)
    expect(editor.getActiveGraph().nodes).toHaveLength(5)
    editor.undo(); paste(editor)
    expect(editor.getActiveGraph().nodes.at(-1)!.position).toEqual({ x: 40, y: 40 })
  })
  it('converts a group with incoming/outgoing edges without losing any member, contract or label', () => {
    const { p, editor, group, nodes } = fixture()
    editor.execute({ type: 'convert-group', id: group.id })
    const converted = editor.projectStore.getState().project
    const wrapper = converted.nodes.find(n => n.type === 'subworkflow')!
    expect(wrapper.type).toBe('subworkflow')
    expect(converted.subworkflows[0]!.nodes).toEqual([nodes[1], nodes[2]])
    expect(converted.subworkflows[0]!.edges).toEqual([p.edges[1]])
    expect(converted.edges.map(e => e.id)).toEqual([p.edges[0]!.id, p.edges[2]!.id])
    expect(wrapper.ports.map(port => port.binding?.nodeId)).toEqual([nodes[1]!.id, nodes[2]!.id])
    expect(validateProject(converted).filter(i => i.severity === 'error')).toEqual([])
    expect(deserializeProject(serializeProject(converted))).toEqual(converted)
    editor.undo(); expect(editor.projectStore.getState().project.nodes).toEqual(p.nodes)
    expect(editor.projectStore.getState().project.edges).toEqual(p.edges)
    editor.redo(); expect(editor.projectStore.getState().project.subworkflows).toEqual(converted.subworkflows)
  })
  it('edits a nested graph, revisits the correct scope on history travel, and finds nested entities', () => {
    const { editor, group } = fixture()
    editor.execute({ type: 'convert-group', id: group.id })
    const nested = editor.projectStore.getState().project.subworkflows[0]!
    editor.navigate(nested.id)
    const n = createNode('note')
    editor.execute({ type: 'create-node', node: n })
    expect(editor.projectStore.getState().project.nodes.some(node => node.id === n.id)).toBe(false)
    expect(getGraph(editor.projectStore.getState().project, nested.id).nodes).toHaveLength(3)
    editor.navigate(null); editor.undo()
    expect(editor.navigationStore.getState().graphId).toBe(nested.id)
    expect(editor.getActiveGraph().nodes).toHaveLength(2)
    editor.redo(); editor.navigate(null); editor.focusEntity(n.id)
    expect(editor.selectionStore.getState().nodeIds).toEqual([n.id])
    expect(editor.navigationStore.getState().path).toEqual([null, nested.id])
  })
  it('keeps absolute durable positions while the Canvas adapter uses relative child positions', () => {
    const { p, group, nodes, editor } = fixture()
    const canvas = projectToCanvas(p, { nodeIds: [], edgeIds: [] })
    const projected = canvas.nodes.find(n => n.id === nodes[1]!.id)!
    expect(projected.parentId).toBe(group.id)
    expect(domainPosition(p, projected.id, projected.position)).toEqual(nodes[1]!.position)
    editor.execute({ type: 'move-group', id: group.id, position: { x: group.position.x + 100, y: group.position.y + 100 } })
    expect(editor.getActiveGraph().nodes[1]!.position).toEqual({ x: nodes[1]!.position.x + 100, y: nodes[1]!.position.y + 100 })
    editor.undo(); expect(editor.getActiveGraph().nodes).toEqual(p.nodes)
    editor.execute({ type: 'edit-group', id: group.id, changes: { collapsed: true } })
    const collapsed = projectToCanvas(editor.getActiveGraph(), { nodeIds: [], edgeIds: [] })
    expect(collapsed.nodes.filter(n => n.hidden)).toHaveLength(2)
    expect(collapsed.edges.filter(e => !e.hidden).map(e => [e.source, e.target])).toEqual([[nodes[0]!.id, group.id], [group.id, nodes[3]!.id]])
  })
  it('duplicates nested graphs with fresh identities and remapped boundaries in one undoable command', () => {
    const { editor, group } = fixture()
    editor.execute({ type: 'convert-group', id: group.id })
    const p = editor.projectStore.getState().project
    const wrapper = p.nodes.find(n => n.type === 'subworkflow')!
    const clip = copySelection(p, p, [wrapper.id], [])
    const payload = cloneClipboard(clip, p)
    editor.execute({ type: 'paste', payload })
    const next = editor.projectStore.getState().project
    expect(next.subworkflows).toHaveLength(2)
    expect(payload.graph.nodes[0]!.id).not.toBe(wrapper.id)
    expect(payload.graph.nodes[0]!.ports[0]!.binding?.nodeId).toBe(payload.subworkflows[0]!.nodes[0]!.id)
    expect(validateProject(next).filter(i => i.severity === 'error')).toEqual([])
    editor.undo(); expect(editor.projectStore.getState().project.subworkflows).toHaveLength(1)
  })
  it('remaps shared-schema contracts on cross-project paste, preserving inline JSON values', () => {
    const p = createProject(); const n = createNode('data'); const schemaId = createId()
    if (n.type !== 'data') throw new Error('factory')
    p.schemas.push({ id: schemaId, name: 'Contract', definition: { type: 'object', description: schemaId } })
    n.config.schema = { kind: 'schema-ref', schemaId }; p.nodes.push(n)
    const payload = cloneClipboard(copySelection(p, p, [n.id], []), createProject())
    expect(payload.schemas[0]!.definition).toEqual(p.schemas[0]!.definition)
    expect(payload.graph.nodes[0]!.config).toEqual({ schema: { kind: 'schema-ref', schemaId: payload.schemas[0]!.id } })
  })
  it('aligns/distributes deterministically and undo restores exact positions', () => {
    const { editor, nodes } = fixture()
    const ids = nodes.map(n => n.id)
    editor.execute({ type: 'align', ids, alignment: 'top' })
    expect(editor.getActiveGraph().nodes.every(n => n.position.y === 0)).toBe(true)
    editor.undo(); expect(editor.getActiveGraph().nodes.map(n => n.position)).toEqual(nodes.map(n => n.position))
    const aligned = alignPosition(editor.getActiveGraph(), nodes[1]!.id, { x: 355, y: 4 }, [nodes[1]!.id], 1)
    expect(aligned.guides.y).toBe(0)
    expect(aligned.position.y).toBe(0)
  })
  it('retains cross-subsystem tool references and cascades deletion through exposed ports', () => {
    const p = createProject()
    const agent = createNode('agent'); const tool = createNode('tool')
    if (agent.type !== 'agent') throw new Error('factory')
    agent.config.toolIds = [tool.id]
    p.nodes.push(agent, tool)
    const edge = createEdge(agent.id, tool.id)
    p.edges.push(edge)
    const editor = createEditor(p)
    editor.execute({ type: 'set-edge-type', id: edge.id, kind: 'tool-access' })
    const group = makeGroup(editor.getActiveGraph(), [tool.id])
    editor.execute({ type: 'group', group }); editor.execute({ type: 'convert-group', id: group.id })
    const grouped = editor.projectStore.getState().project
    expect(validateProject(grouped).filter(i => i.severity === 'error')).toEqual([])
    editor.navigate(grouped.subworkflows[0]!.id)
    editor.execute({ type: 'delete', nodeIds: [tool.id], edgeIds: [] })
    expect(editor.projectStore.getState().project.edges).toHaveLength(0)
    expect(validateProject(editor.projectStore.getState().project).filter(i => i.severity === 'error')).toEqual([])
    editor.undo()
    expect(editor.projectStore.getState().project.edges).toEqual(grouped.edges)
    expect(editor.projectStore.getState().project.nodes).toEqual(grouped.nodes)
  })
})
