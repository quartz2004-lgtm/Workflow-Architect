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
