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

import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { defaultAgentLimits } from '../domain/agent-config'
import { getGraph } from '../domain/graphs'
import { parseProject } from '../domain/serialization'
import { nodeSchema, type Graph, type Project, type WorkflowNode } from '../domain/schema'
import { validateProject } from '../validation/validate-project'
import type { EditorCommand } from '../editor/commands'
import { designProposalSchema } from './assistant-schema'
import { localModelNameSchema } from './schema'

/** Generated proposals can only append a validated fragment. Grants require a separate human choice. */
export function prepareProposal(value: unknown, project: Project, graphId: string | null, model: string, grantTools: boolean): { graph: Graph; command: EditorCommand; grants: string[] } {
  const proposal = designProposalSchema.parse(value)
  localModelNameSchema.parse(model)
  if (!proposal.nodes.length) throw new Error('Предложение пока не содержит узлов.')
  const owner = getGraph(project, graphId)
  const offset = owner.nodes.length ? Math.max(...owner.nodes.map(node => node.position.x + node.size.width)) + 120 : 80
  const keys = new Map<number, WorkflowNode>()
  for (const [index, source] of proposal.nodes.entries()) {
    if (keys.has(source.key)) throw new Error('Модель вернула повторяющиеся ключи узлов.')
    const node = createNode(source.type, { x: offset + index % 3 * 340, y: 120 + Math.floor(index / 3) * 240 })
    node.title = source.title; node.description = source.description
    if (node.type === 'trigger') { node.config.triggerType = 'manual'; node.operation = { kind: 'manual' } }
    if (node.type === 'agent') {
      if (!source.role.trim() || !source.systemPrompt.trim()) throw new Error('Модель не указала роль или инструкции Agent.')
      node.config = { role: source.role, systemPrompt: source.systemPrompt, model: { provider: 'ollama', name: model }, toolIds: [] }
      node.operation = { kind: 'agent', limits: structuredClone(defaultAgentLimits), minimumWords: 0, requireTools: false }
    }
    if (node.type === 'tool') { node.config = { category: 'text', provider: 'builtin', reference: 'text-statistics', authentication: { type: 'none' } }; node.operation = { kind: 'text-statistics', minimumWords: 0 } }
    if (node.type === 'artifact') { node.config = { artifactType: 'document', format: 'Markdown', storageTarget: 'local' }; node.operation = { kind: 'artifact', filename: 'result.md', format: 'text', source: { kind: 'input', pointer: '' } } }
    keys.set(source.key, node)
  }
  const grants: string[] = [], edgeKeys = new Set<string>()
  const edges = proposal.edges.map(source => {
    const from = keys.get(source.source), to = keys.get(source.target)
    if (!from || !to || from === to) throw new Error('Предложение содержит отсутствующий узел или петлю.')
    const identity = `${source.source}:${source.target}:${source.type}`
    if (edgeKeys.has(identity)) throw new Error('Предложение содержит повторяющуюся связь.')
    edgeKeys.add(identity)
    const port = (node: WorkflowNode, direction: 'input' | 'output') => {
      const existing = node.ports.find(port => port.direction === direction && port.kind === source.type)
      if (existing) return existing.id
      const id = createId(); node.ports.push({ id, name: source.type === 'tool-access' ? 'tools' : direction, direction, kind: source.type }); return id
    }
    if (source.type === 'tool-access') {
      if (from.type !== 'agent' || to.type !== 'tool') throw new Error('Tool access разрешён только Agent → Tool.')
      grants.push(`${from.title} → ${to.title}`)
      if (grantTools) from.config.toolIds!.push(to.id)
    }
    return { ...createEdge(from.id, to.id, port(from, 'output'), port(to, 'input')), type: source.type }
  })
  const graph = { nodes: [...keys.values()].map(node => nodeSchema.parse(node)), edges, groups: [] }
  const fragment = parseProject({ ...createProject(), ...graph })
  const errors = validateProject(fragment).filter(issue => issue.severity === 'error')
  if (errors.length) throw new Error(errors.map(issue => issue.message).join('\n'))
  // Proposals cannot introduce cycles, including when they consist of Concept nodes.
  const visited = new Set<string>(), active = new Set<string>()
  const visit = (id: string) => {
    if (active.has(id)) throw new Error('Предложение содержит цикл; настройте ограниченный Loop вручную.')
    if (visited.has(id)) return
    visited.add(id); active.add(id)
    for (const edge of edges.filter(edge => edge.sourceNode === id && edge.type === 'flow')) visit(edge.targetNode)
    active.delete(id)
  }
  graph.nodes.forEach(node => visit(node.id))
  return { graph, grants, command: { type: 'batch', commands: [...graph.nodes.map(node => ({ type: 'create-node' as const, node })), ...edges.map(edge => ({ type: 'create-edge' as const, edge }))] } }
}
