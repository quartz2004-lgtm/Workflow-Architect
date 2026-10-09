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

import type { Contract, Graph, Project, WorkflowNode } from '../domain/schema'
import { connectionProblems } from './connections'
import { jsonSchemaProblem } from './json-schema'
import { graphEntries } from '../domain/graphs'

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  entityId: string
  message: string
}

/** Semantic diagnostics are independent of rendering and structural parsing. */
export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const add = (severity: ValidationIssue['severity'], code: string, entityId: string, message: string) => issues.push({ severity, code, entityId, message })
  const ids = new Set<string>()
  const register = (id: string) => {
    if (ids.has(id)) add('error', 'duplicate-id', id, 'Повторяющийся ID.')
    ids.add(id)
  }
  const schemaIds = new Set(project.schemas.map(s => s.id))
  const promptIds = new Set(project.prompts.map(p => p.id))
  const workflows = new Map(project.subworkflows.map(w => [w.id, w]))
  const allNodes = new Map(graphEntries(project).flatMap(entry => entry.graph.nodes.map(node => [node.id, node] as const)))
  const contract = (value: Contract | undefined, owner: string) => {
    if (value?.kind === 'schema-ref' && !schemaIds.has(value.schemaId)) add('error', 'broken-schema', owner, 'Схема не найдена.')
    if (value?.kind === 'json-schema') { const problem = jsonSchemaProblem(value.schema); if (problem) add('error', 'invalid-schema', owner, problem) }
  }
  register(project.project.id)
  for (const entity of [...project.schemas, ...project.prompts, ...project.subworkflows]) register(entity.id)
  for (const schema of project.schemas) { const problem = jsonSchemaProblem(schema.definition); if (problem) add('error', 'invalid-schema', schema.id, problem) }
  for (const workflow of project.subworkflows) for (const port of workflow.ports) { register(port.id); contract(port.contract, workflow.id) }
  const checkConfig = (node: WorkflowNode, nodes: Map<string, WorkflowNode>) => {
    const cfg = node.config
    if (node.status !== 'disabled' && node.type !== 'concept' && node.type !== 'note') {
      const required: Partial<Record<WorkflowNode['type'], string[]>> = {
        tool: ['category', 'reference'], trigger: ['triggerType'], logic: ['logicType'], data: ['dataType'], human: ['interactionType', 'instruction'], artifact: ['artifactType', 'format'],
      }
      for (const field of required[node.type] ?? []) if (!(cfg as Record<string, unknown>)[field]) add('warning', 'required-field', node.id, `Заполните ${field}.`)
      if ((node.type === 'agent' || node.type === 'tool') && (!node.config.input || !node.config.output)) add('warning', 'missing-io', node.id, 'Определите входной и выходной контракты.')
    }
    if ('input' in cfg) contract(cfg.input, node.id)
    if ('output' in cfg) contract(cfg.output, node.id)
    if ('schema' in cfg) contract(cfg.schema, node.id)
    if ('payload' in cfg) contract(cfg.payload, node.id)
    if ('response' in cfg) contract(cfg.response, node.id)
    if ('execution' in cfg && cfg.execution?.fallbackNodeId && !nodes.has(cfg.execution.fallbackNodeId)) add('error', 'broken-fallback', node.id, 'Fallback-узел не найден в этом графе.')
    if (node.type === 'agent') {
      if (!node.config.role || !node.config.model?.provider || !node.config.model.name || !(node.config.systemPrompt || node.config.promptId)) add('warning', 'incomplete-agent', node.id, 'Укажите роль, модель и инструкции агента.')
      if (node.config.promptId && !promptIds.has(node.config.promptId)) add('error', 'broken-prompt', node.id, 'Prompt не найден.')
      for (const id of node.config.toolIds ?? []) if (nodes.get(id)?.type !== 'tool') add('error', 'broken-tool', node.id, 'Ссылка должна указывать на Tool в этом графе.')
      for (const id of node.config.context?.attachedNodeIds ?? []) if (!nodes.has(id)) add('error', 'broken-context', node.id, 'Контекстный узел не найден.')
    }
    if (node.type === 'logic') for (const branch of node.config.branches ?? []) register(branch.id)
    if (node.type === 'subworkflow') {
      const nested = node.config.subworkflowId ? workflows.get(node.config.subworkflowId) : undefined
      if (!nested) add('error', 'broken-subworkflow', node.id, 'Вложенный граф не найден.')
      else if (!nested.nodes.length) add('warning', 'empty-subworkflow', node.id, 'Вложенный граф пуст.')
    }
  }
  const checkGraph = (graph: Graph) => {
    const nodes = new Map(graph.nodes.map(n => [n.id, n]))
    const connected = new Set(graph.edges.flatMap(e => [e.sourceNode, e.targetNode]))
    for (const node of graph.nodes) {
      register(node.id)
      if (!node.title.trim()) add('warning', 'missing-title', node.id, 'Укажите название узла.')
      if (node.type === 'concept') add('warning', 'unresolved-concept', node.id, 'Идея ещё не формализована.')
      if (node.type !== 'note' && !connected.has(node.id)) add('info', 'orphan-node', node.id, 'Узел не имеет связей.')
      for (const port of node.ports) {
        register(port.id); contract(port.contract, node.id)
        if (port.binding) {
          const nested = node.type === 'subworkflow' && node.config.subworkflowId ? workflows.get(node.config.subworkflowId) : undefined
          const boundNode = nested?.nodes.find(n => n.id === port.binding?.nodeId)
          const boundPort = boundNode?.ports.find(p => p.id === port.binding?.portId)
          if (!boundNode || (port.binding.portId && (!boundPort || boundPort.direction !== port.direction || boundPort.kind !== port.kind))) add('error', 'broken-port-binding', node.id, 'Открытый порт должен ссылаться на совместимый порт внутреннего графа.')
        }
      }
      checkConfig(node, allNodes)
    }
    for (const edge of graph.edges) {
      register(edge.id)
      for (const problem of connectionProblems(graph, edge, project)) add('error', problem.code, edge.id, problem.message)
      if (edge.type === 'data' && !edge.contract) add('warning', 'missing-contract', edge.id, 'Для передачи данных нужен контракт.')
      contract(edge.contract, edge.id)
    }
    const grouped = new Set<string>()
    for (const group of graph.groups) {
      register(group.id)
      for (const id of group.nodeIds) {
        if (!nodes.has(id)) add('error', 'broken-group', group.id, 'Узел группы не найден.')
        if (grouped.has(id)) add('error', 'overlapping-group', group.id, 'Узел может принадлежать одной группе.')
        grouped.add(id)
      }
    }
  }
  checkGraph(project)
  project.subworkflows.forEach(checkGraph)
  const visited = new Set<string>()
  const active = new Set<string>()
  const visit = (id: string) => {
    if (active.has(id)) { add('error', 'recursive-subworkflow', id, 'Обнаружена рекурсивная вложенность.'); return }
    if (visited.has(id)) return
    visited.add(id); active.add(id)
    for (const node of workflows.get(id)?.nodes ?? []) if (node.type === 'subworkflow' && node.config.subworkflowId) visit(node.config.subworkflowId)
    active.delete(id)
  }
  workflows.forEach(w => visit(w.id))
  return issues
}
