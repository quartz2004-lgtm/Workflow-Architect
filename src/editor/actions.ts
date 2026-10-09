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
