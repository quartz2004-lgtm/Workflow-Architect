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
import { getGraph, graphEntries } from '../domain/graphs'
import { alignNodes, convertGroup, type Alignment } from './organization'
import type { GraphClipboard } from './clipboard'
import { nodeSchema, type EngineeringType, type Group, type Position, type Project, type WorkflowEdge, type WorkflowNode } from '../domain/schema'

type NodeFields = Pick<WorkflowNode, 'title' | 'description' | 'notes' | 'color' | 'tags' | 'links' | 'status'>
export type EditorCommand =
  | { type: 'create-node'; node: WorkflowNode }
  | { type: 'edit-node'; id: string; changes: Partial<NodeFields> }
  | { type: 'configure-node'; node: WorkflowNode }
  | { type: 'move-nodes'; positions: { id: string; position: Position }[] }
  | { type: 'resize-node'; id: string; size: WorkflowNode['size']; position?: Position }
  | { type: 'delete'; nodeIds: string[]; edgeIds: string[]; groupIds?: string[] }
  | { type: 'create-edge'; edge: WorkflowEdge }
  | { type: 'edit-edge'; id: string; changes: Partial<Omit<WorkflowEdge, 'id'>> }
  | { type: 'convert-node'; id: string; target: EngineeringType }
  | { type: 'group'; group: Group }
  | { type: 'ungroup'; id: string }
  | { type: 'move-group'; id: string; position: Position }
  | { type: 'edit-project'; changes: Partial<Pick<Project['project'], 'name' | 'description'>> }
  | { type: 'edit-settings'; changes: Partial<Project['settings']> }
  | { type: 'save-schema'; schema: Project['schemas'][number] }
  | { type: 'delete-schema'; id: string }
  | { type: 'save-prompt'; prompt: Project['prompts'][number] }
  | { type: 'delete-prompt'; id: string }
  | { type: 'set-edge-type'; id: string; kind: WorkflowEdge['type'] }
  | { type: 'reverse-edge'; id: string }
  | { type: 'edit-group'; id: string; changes: Partial<Omit<Group, 'id' | 'nodeIds'>> }
  | { type: 'convert-group'; id: string }
  | { type: 'align'; ids: string[]; alignment: Alignment }
  | { type: 'batch'; commands: EditorCommand[] }
  | { type: 'paste'; payload: GraphClipboard }

/** Mutates an Immer draft. No UI/library values enter this boundary. */
export function applyCommand(project: Project, command: EditorCommand, graphId: string | null = null): void {
  const graph = getGraph(project, graphId)
  const node = (id: string) => {
    const result = graph.nodes.find(n => n.id === id)
    if (!result) throw new Error('Узел не найден.')
    return result
  }
  switch (command.type) {
    case 'create-node': {
      const created = structuredClone(command.node)
      if (created.type === 'subworkflow' && !created.config.subworkflowId) {
        const id = createId()
        created.config.subworkflowId = id
        project.subworkflows.push({ id, title: created.title, description: '', nodes: [], edges: [], groups: [], ports: [] })
      }
      graph.nodes.push(created)
      break
    }
    case 'edit-node': Object.assign(node(command.id), command.changes); break
    case 'configure-node': {
      const previous = node(command.node.id)
      if (previous.type !== command.node.type) throw new Error('Используйте команду конвертации для смены типа.')
      graph.nodes[graph.nodes.indexOf(previous)] = command.node
      break
    }
    case 'move-nodes': for (const item of command.positions) node(item.id).position = item.position; break
    case 'resize-node': {
      node(command.id).size = command.size
      if (command.position) node(command.id).position = command.position
      break
    }
    case 'delete': {
      const deleted = new Set(command.nodeIds)
      for (const group of graph.groups) if (command.groupIds?.includes(group.id)) for (const id of group.nodeIds) deleted.add(id)
      graph.groups = graph.groups.filter(g => !command.groupIds?.includes(g.id))
      graph.nodes = graph.nodes.filter(n => !deleted.has(n.id))
      graph.edges = graph.edges.filter(e => !command.edgeIds.includes(e.id) && !deleted.has(e.sourceNode) && !deleted.has(e.targetNode))
      for (const group of graph.groups) group.nodeIds = group.nodeIds.filter(id => !deleted.has(id))
      for (const item of graphEntries(project).flatMap(entry => entry.graph.nodes)) {
        if (item.type === 'agent') {
          if (item.config.toolIds) item.config.toolIds = item.config.toolIds.filter(id => !deleted.has(id))
          if (item.config.context?.attachedNodeIds) item.config.context.attachedNodeIds = item.config.context.attachedNodeIds.filter(id => !deleted.has(id))
        }
        if ('execution' in item.config && item.config.execution?.fallbackNodeId && deleted.has(item.config.execution.fallbackNodeId)) delete item.config.execution.fallbackNodeId
      }
      const removedPorts = new Set<string>()
      let changed = true
      while (changed) {
        changed = false
        for (const entry of graphEntries(project)) for (const owner of entry.graph.nodes) {
          owner.ports = owner.ports.filter(port => {
            if (port.binding && (deleted.has(port.binding.nodeId) || (port.binding.portId && removedPorts.has(port.binding.portId)))) { removedPorts.add(port.id); changed = true; return false }
            return true
          })
        }
      }
      if (removedPorts.size) for (const entry of graphEntries(project)) entry.graph.edges = entry.graph.edges.filter(edge => !removedPorts.has(edge.sourcePort ?? '') && !removedPorts.has(edge.targetPort ?? ''))
      break
    }
    case 'create-edge': graph.edges.push(command.edge); break
    case 'edit-edge': {
      const edge = graph.edges.find(e => e.id === command.id)
      if (!edge) throw new Error('Связь не найдена.')
      Object.assign(edge, command.changes)
      break
    }
    case 'convert-node': {
      const previous = node(command.id)
      if (previous.type !== 'concept') throw new Error('Конвертация доступна для Concept Node.')
      const config = command.target === 'subworkflow' ? { subworkflowId: createId() } : {}
      if ('subworkflowId' in config && config.subworkflowId) project.subworkflows.push({ id: config.subworkflowId, title: previous.title, description: previous.description, nodes: [], edges: [], groups: [], ports: [] })
      graph.nodes[graph.nodes.indexOf(previous)] = nodeSchema.parse({ ...previous, type: command.target, config })
      break
    }
    case 'group': graph.groups.push(command.group); break
    case 'ungroup': graph.groups = graph.groups.filter(g => g.id !== command.id); break
    case 'move-group': {
      const group = graph.groups.find(g => g.id === command.id)
      if (!group) throw new Error('Группа не найдена.')
      const dx = command.position.x - group.position.x
      const dy = command.position.y - group.position.y
      for (const id of group.nodeIds) { const child = node(id); child.position = { x: child.position.x + dx, y: child.position.y + dy } }
      group.position = command.position
      break
    }
    case 'edit-project': Object.assign(project.project, command.changes); break
    case 'edit-settings': Object.assign(project.settings, command.changes); break
    case 'save-schema': {
      const index = project.schemas.findIndex(s => s.id === command.schema.id)
      if (index < 0) project.schemas.push(command.schema); else project.schemas[index] = command.schema
      break
    }
    case 'delete-schema': project.schemas = project.schemas.filter(s => s.id !== command.id); break
    case 'save-prompt': {
      const index = project.prompts.findIndex(p => p.id === command.prompt.id)
      if (index < 0) project.prompts.push(command.prompt); else project.prompts[index] = command.prompt
      break
    }
    case 'delete-prompt': project.prompts = project.prompts.filter(p => p.id !== command.id); break
    case 'set-edge-type':
    case 'reverse-edge': {
      const edge = graph.edges.find(e => e.id === command.id)
      if (!edge) throw new Error('Связь не найдена.')
      if (command.type === 'reverse-edge') [edge.sourceNode, edge.targetNode] = [edge.targetNode, edge.sourceNode]
      else edge.type = command.kind
      const ensurePort = (id: string, direction: 'input' | 'output') => {
        const owner = node(id)
        const existing = owner.ports.find(p => p.direction === direction && p.kind === edge.type)
        if (existing) return existing.id
        const port = { id: createId(), name: edge.type, kind: edge.type, direction }
        owner.ports.push(port)
        return port.id
      }
      edge.sourcePort = ensurePort(edge.sourceNode, 'output')
      edge.targetPort = ensurePort(edge.targetNode, 'input')
      break
    }
    case 'edit-group': {
      const group = graph.groups.find(g => g.id === command.id)
      if (!group) throw new Error('Группа не найдена.')
      Object.assign(group, command.changes)
      break
    }
    case 'convert-group': convertGroup(project, graph, command.id); break
    case 'align': alignNodes(graph, command.ids, command.alignment); break
    case 'batch': command.commands.forEach(item => applyCommand(project, item, graphId)); break
    case 'paste': {
      graph.nodes.push(...command.payload.graph.nodes); graph.edges.push(...command.payload.graph.edges); graph.groups.push(...command.payload.graph.groups)
      project.subworkflows.push(...command.payload.subworkflows); project.schemas.push(...command.payload.schemas); project.prompts.push(...command.payload.prompts)
      break
    }
  }
}

