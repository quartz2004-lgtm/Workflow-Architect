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

import { createId } from '../domain/factories'
import type { Graph, Project } from '../domain/schema'

export interface GraphClipboard { graph: Graph; subworkflows: Project['subworkflows']; schemas: Project['schemas']; prompts: Project['prompts'] }

export function copySelection(project: Project, graph: Graph, nodeIds: string[], groupIds: string[]): GraphClipboard {
  const ids = new Set(nodeIds)
  const groups = graph.groups.filter(g => groupIds.includes(g.id))
  groups.forEach(g => g.nodeIds.forEach(id => ids.add(id)))
  const nodes = graph.nodes.filter(n => ids.has(n.id))
  const edges = graph.edges.filter(e => ids.has(e.sourceNode) && ids.has(e.targetNode))
  const nested = new Set<string>()
  const visit = (g: Graph) => {
    for (const node of g.nodes) if (node.type === 'subworkflow' && node.config.subworkflowId && !nested.has(node.config.subworkflowId)) {
      const child = project.subworkflows.find(s => s.id === node.config.subworkflowId)
      if (child) { nested.add(child.id); visit(child) }
    }
  }
  visit({ nodes, edges, groups })
  const subworkflows = project.subworkflows.filter(g => nested.has(g.id))
  const schemaIds = new Set<string>(); const promptIds = new Set<string>()
  const collect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(collect); return }
    for (const [key, item] of Object.entries(value)) {
      if (key === 'schemaId' && typeof item === 'string') schemaIds.add(item)
      else if (key === 'promptId' && typeof item === 'string') promptIds.add(item)
      else if (!['metadata', 'parameters'].includes(key) && !(key === 'schema' && 'kind' in value && value.kind === 'json-schema')) collect(item)
    }
  }
  collect({ nodes, edges, subworkflows })
  return structuredClone({ graph: { nodes, edges, groups }, subworkflows, schemas: project.schemas.filter(s => schemaIds.has(s.id)), prompts: project.prompts.filter(p => promptIds.has(p.id)) })
}

export function cloneClipboard(clipboard: GraphClipboard, target: Project, offset = { x: 40, y: 40 }): GraphClipboard {
  const ids = new Map<string, string>()
  const register = (id: string) => ids.set(id, createId())
  for (const graph of [clipboard.graph, ...clipboard.subworkflows]) {
    if ('id' in graph && typeof graph.id === 'string') register(graph.id)
    for (const node of graph.nodes) { register(node.id); node.ports.forEach(p => register(p.id)); if (node.type === 'logic') node.config.branches?.forEach(b => register(b.id)) }
    graph.edges.forEach(e => register(e.id)); graph.groups.forEach(g => register(g.id))
  }
  clipboard.subworkflows.forEach(g => g.ports.forEach(p => register(p.id)))
  const schemas = clipboard.schemas.filter(s => !target.schemas.some(t => t.id === s.id && JSON.stringify(t) === JSON.stringify(s)))
  const prompts = clipboard.prompts.filter(s => !target.prompts.some(t => t.id === s.id && JSON.stringify(t) === JSON.stringify(s)))
  for (const resource of [...schemas, ...prompts]) register(resource.id)
  const idKeys = new Set(['id', 'nodeId', 'nodeIds', 'sourceNode', 'targetNode', 'sourcePort', 'targetPort', 'toolIds', 'attachedNodeIds', 'fallbackNodeId', 'subworkflowId', 'portId', 'schemaId', 'promptId'])
  const remap = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string') return idKeys.has(key) ? ids.get(value) ?? value : value
    if (Array.isArray(value)) return value.map(item => remap(item, key))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ['definition', 'metadata', 'parameters'].includes(k) || (k === 'schema' && 'kind' in value && value.kind === 'json-schema') ? structuredClone(v) : remap(v, k)]))
    return value
  }
  // The source was validated on copy; known identity/reference fields are the only rewritten values.
  const copy = remap({ ...clipboard, schemas, prompts }) as GraphClipboard
  for (const entity of [...copy.graph.nodes, ...copy.graph.groups]) entity.position = { x: entity.position.x + offset.x, y: entity.position.y + offset.y }
  return copy
}
