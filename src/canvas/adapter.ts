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

import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { Graph, Group, Position, WorkflowNode } from '../domain/schema'

export type WorkflowCanvasNode = Node<{ node: WorkflowNode }, 'workflow'>
export type GroupCanvasNode = Node<{ group: Group }, 'workflow-group'>
export type CanvasNode = WorkflowCanvasNode | GroupCanvasNode
export type CanvasEdge = Edge<{ kind: string }>

/** A disposable projection: never serialize this structure. */
export function projectToCanvas(project: Graph, selection: { nodeIds: string[]; edgeIds: string[]; groupIds?: string[] }) {
  const membership = new Map(project.groups.flatMap(group => group.nodeIds.map(id => [id, group] as const)))
  return {
    nodes: [...project.groups.map((group): GroupCanvasNode => ({
      id: group.id, type: 'workflow-group', position: group.position, data: { group },
      width: group.collapsed ? 260 : group.size.width, height: group.collapsed ? 100 : group.size.height,
      selected: selection.groupIds?.includes(group.id), zIndex: -1, dragHandle: '.group-header',
      ariaLabel: `Group: ${group.title}`, connectable: false,
    })), ...project.nodes.map((node): WorkflowCanvasNode => ({
      id: node.id, type: 'workflow', position: { x: node.position.x - (membership.get(node.id)?.position.x ?? 0), y: node.position.y - (membership.get(node.id)?.position.y ?? 0) },
      parentId: membership.get(node.id)?.id, hidden: membership.get(node.id)?.collapsed,
      width: node.size.width, height: node.size.height,
      selected: selection.nodeIds.includes(node.id), data: { node },
      ariaLabel: `${node.type}: ${node.title}`,
    }))],
    edges: project.edges.map((edge): CanvasEdge => {
      const sourceGroup = membership.get(edge.sourceNode)
      const targetGroup = membership.get(edge.targetNode)
      return ({
      id: edge.id, source: sourceGroup?.collapsed ? sourceGroup.id : edge.sourceNode, target: targetGroup?.collapsed ? targetGroup.id : edge.targetNode,
      sourceHandle: sourceGroup?.collapsed ? 'group-out' : edge.sourcePort, targetHandle: targetGroup?.collapsed ? 'group-in' : edge.targetPort,
      hidden: !!sourceGroup?.collapsed && sourceGroup.id === targetGroup?.id,
      label: edge.label || undefined, type: 'smoothstep', selected: selection.edgeIds.includes(edge.id),
      data: { kind: edge.type }, markerEnd: { type: MarkerType.ArrowClosed },
      className: `edge-${edge.type}`,
    }) }),
  }
}

export function domainPosition(graph: Graph, id: string, position: Position): Position {
  const parent = graph.groups.find(g => g.nodeIds.includes(id))
  return parent ? { x: position.x + parent.position.x, y: position.y + parent.position.y } : position
}

export function reconcileNode(current: CanvasNode | undefined, next: CanvasNode): CanvasNode {
  if (!current || current.type !== next.type) return next
  const sameData = current.type === 'workflow' && next.type === 'workflow' ? current.data.node === next.data.node : current.type === 'workflow-group' && next.type === 'workflow-group' && current.data.group === next.data.group
  if (sameData && current.selected === next.selected && current.hidden === next.hidden && current.parentId === next.parentId && current.position.x === next.position.x && current.position.y === next.position.y) return current
  return { ...next, measured: current.measured }
}
