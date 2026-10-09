import { createNode } from '../domain/factories'
import type { NodeType, Position } from '../domain/schema'
import { cloneClipboard, copySelection, type GraphClipboard } from './clipboard'
import { makeGroup } from './organization'
import type { Editor } from './session'

const clipboards = new WeakMap<Editor, GraphClipboard>()
export function canPaste(editor: Editor) { return Boolean(clipboards.get(editor)?.graph.nodes.length) }
export function addNode(editor: Editor, type: NodeType, position?: Position) {
  const node = createNode(type, position ?? editor.canvasStore.getState().center)
  editor.execute({ type: 'create-node', node })
  editor.select([node.id])
  return node.id
}
export function groupSelection(editor: Editor) {
  const group = makeGroup(editor.getActiveGraph(), editor.selectionStore.getState().nodeIds)
  editor.execute({ type: 'group', group })
  editor.select([], [], [group.id])
}
export function copy(editor: Editor) {
  const { nodeIds, groupIds } = editor.selectionStore.getState()
  if (!nodeIds.length && !groupIds.length) return
  clipboards.set(editor, copySelection(editor.projectStore.getState().project, editor.getActiveGraph(), nodeIds, groupIds))
}
export function paste(editor: Editor, position?: Position) {
  const clipboard = clipboards.get(editor)
  if (!clipboard?.graph.nodes.length) return
  const minX = Math.min(...clipboard.graph.nodes.map(n => n.position.x))
  const minY = Math.min(...clipboard.graph.nodes.map(n => n.position.y))
  const offset = position ? { x: position.x - minX, y: position.y - minY } : { x: 40, y: 40 }
  const payload = cloneClipboard(clipboard, editor.projectStore.getState().project, offset)
  editor.execute({ type: 'paste', payload })
  editor.select(payload.graph.nodes.map(n => n.id), [], payload.graph.groups.map(g => g.id))
}
export function duplicate(editor: Editor) {
  const { nodeIds, groupIds } = editor.selectionStore.getState()
  const project = editor.projectStore.getState().project
  const clipboard = copySelection(project, editor.getActiveGraph(), nodeIds, groupIds)
  if (!clipboard.graph.nodes.length) return
  const payload = cloneClipboard(clipboard, project, { x: 40, y: 40 })
  editor.execute({ type: 'paste', payload })
  editor.select(payload.graph.nodes.map(n => n.id), [], payload.graph.groups.map(g => g.id))
}
export function deleteSelection(editor: Editor) {
  const { nodeIds, edgeIds, groupIds } = editor.selectionStore.getState()
  if (nodeIds.length + edgeIds.length + groupIds.length) editor.execute({ type: 'delete', nodeIds, edgeIds, groupIds })
}
export function selectAll(editor: Editor) {
  const graph = editor.getActiveGraph()
  editor.select(graph.nodes.map(n => n.id), [], graph.groups.map(g => g.id))
}
