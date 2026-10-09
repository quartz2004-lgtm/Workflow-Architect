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

import { nodeSchema, type NodeType, type Position, type Project, type WorkflowEdge, type WorkflowNode } from './schema'

export const createId = () => crypto.randomUUID()
export function createNode(type: NodeType = 'concept', position: Position = { x: 0, y: 0 }): WorkflowNode {
  return nodeSchema.parse({
    id: createId(), type, title: type === 'concept' ? 'Новая идея' : type,
    description: '', notes: '', tags: [], links: [], position, size: { width: 260, height: 150 },
    status: 'draft', config: {},
    ports: type === 'note' ? [] : [
      { id: createId(), name: 'input', direction: 'input', kind: 'flow' },
      { id: createId(), name: 'output', direction: 'output', kind: 'flow' },
    ],
  })
}
export function createProject(name = 'Новый workflow'): Project {
  const now = new Date().toISOString()
  return {
    schemaVersion: '0.1', project: { id: createId(), name, description: '', createdAt: now, updatedAt: now },
    nodes: [], edges: [], groups: [], schemas: [], prompts: [], subworkflows: [],
    settings: { defaultMode: 'concept', grid: true, snap: true, motion: 'system' },
  }
}
export function createEdge(sourceNode: string, targetNode: string, sourcePort?: string, targetPort?: string): WorkflowEdge {
  return { id: createId(), sourceNode, targetNode, sourcePort, targetPort, type: 'flow', label: '', metadata: {} }
}
