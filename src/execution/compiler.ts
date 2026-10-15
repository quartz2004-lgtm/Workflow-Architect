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
import { graphEntries } from '../domain/graphs'
import { parseProject } from '../domain/serialization'
import type { Contract, Graph, Project, WorkflowNode } from '../domain/schema'
import type { ValueSource } from '../domain/execution-config'
import { validateProject } from '../validation/validate-project'
import { compileContract } from './contracts'
import { assertValueBudget, jsonEqual } from './values'
import { parallelRegion, validateAgent } from './ai-plan'

export interface ExecutionDiagnostic { severity: 'error' | 'warning'; graphId: string | null; entityId: string; code: string; message: string }
export interface ExecutionPlan {
  readonly planVersion: '0.3' | '0.4' | '0.5'
  readonly id: string
  readonly createdAt: string
  readonly entryNodeId: string
  readonly snapshot: Project
  readonly limits: { readonly maxSteps: number; readonly maxDepth: number; readonly timeoutMs: number }
}
export type CompileResult = { ok: true; plan: ExecutionPlan; diagnostics: ExecutionDiagnostic[] } | { ok: false; diagnostics: ExecutionDiagnostic[] }

export function resolveContract(contract: Contract, project: Project) {
  if (contract.kind === 'informal') return undefined
  if (contract.kind === 'json-schema') return contract.schema
  const schema = project.schemas.find(schema => schema.id === contract.schemaId)
  if (!schema) throw new Error('Общая схема не найдена.')
  return schema.definition
}

/** Validation and snapshotting happen before the executor receives any work. */
export function compileProject(value: unknown, entryNodeId: string): CompileResult {
  const diagnostics: ExecutionDiagnostic[] = []
  const add = (graphId: string | null, entityId: string, code: string, message: string, severity: 'error' | 'warning' = 'error') => diagnostics.push({ graphId, entityId, code, message, severity })
  let project: Project
  try { assertValueBudget(value, 16 * 1024 * 1024, true); project = parseProject(JSON.parse(JSON.stringify(value))) }
  catch (error) { return { ok: false, diagnostics: [{ graphId: null, entityId: '', severity: 'error', code: 'invalid-project', message: error instanceof Error ? error.message : String(error) }] } }
  const entries = graphEntries(project)
  if (entries.length > 100 || entries.reduce((sum, entry) => sum + entry.graph.nodes.length, 0) > 1000 || entries.reduce((sum, entry) => sum + entry.graph.edges.length, 0) > 5000) {
    add(null, project.project.id, 'plan-size', 'Запуск ограничен 1000 узлов, 5000 связей и 100 графами.')
    return { ok: false, diagnostics }
  }
  for (const issue of validateProject(project).filter(issue => issue.severity === 'error')) {
    const owner = entries.find(entry => [...entry.graph.nodes, ...entry.graph.edges, ...entry.graph.groups].some(entity => entity.id === issue.entityId))
    add(owner?.id ?? null, issue.entityId, issue.code, issue.message)
  }
  const entry = project.nodes.find(node => node.id === entryNodeId)
  if (!entry || entry.type !== 'trigger' || entry.status === 'disabled' || !['manual', 'telegram-message', 'schedule'].includes(entry.operation?.kind ?? '')) add(null, entryNodeId, 'entry', 'Выберите настроенный Trigger корневого графа.')
  const contract = (definition: Contract | undefined, graphId: string | null, entityId: string) => {
    if (!definition) return
    try {
      const resolved = resolveContract(definition, project)
      if (resolved === undefined) add(graphId, entityId, 'informal-contract', 'Неформальный контракт является описанием и не проверяет данные.', 'warning')
      else compileContract(resolved)
    } catch (error) { add(graphId, entityId, 'unsupported-contract', error instanceof Error ? error.message : String(error)) }
  }
  for (const { id, graph } of entries) {
    const enabled = graph.nodes.filter(node => node.status !== 'disabled' && node.type !== 'note')
    const active = new Map(enabled.map(node => [node.id, node]))
    for (const node of enabled) {
      const operation = node.operation
      const kinds: Partial<Record<WorkflowNode['type'], readonly string[]>> = { trigger: ['manual', 'telegram-message', 'schedule'], data: ['map'], logic: ['if', 'switch', 'loop', 'merge', 'parallel'], human: ['human'], artifact: ['artifact'], subworkflow: ['subworkflow'], agent: ['agent'], tool: ['text-statistics', 'connector'] }
      if (!kinds[node.type]) { add(id, node.id, 'unsupported-node', `${node.type} пока не исполняется. Завершите формализацию или отключите узел.`); continue }
      if (!operation || !kinds[node.type]!.includes(operation.kind)) { add(id, node.id, 'missing-operation', 'Настройте поддерживаемую операцию этого узла.'); continue }
      try {
        if (operation.kind === 'agent') validateAgent(project, graph, node)
        if (operation.kind === 'parallel') parallelRegion(graph, node)
        if (node.type === 'tool' && operation.kind === 'text-statistics') {
          if (node.config.provider !== 'builtin' || node.config.reference !== 'text-statistics') throw new Error('Выберите builtin / text-statistics. Внешние API пока не исполняются.')
          if (node.config.authentication?.type && node.config.authentication.type !== 'none') throw new Error('Встроенный инструмент не использует credentials.')
          if (node.config.permissions?.length) throw new Error('Свободные permissions не исполняются встроенным инструментом.')
        }
      } catch (error) { add(id, node.id, 'ai-configuration', error instanceof Error ? error.message : String(error)) }
      const sources: ValueSource[] = operation.kind === 'map' || operation.kind === 'connector' ? operation.fields.map(field => field.source)
        : operation.kind === 'if' || operation.kind === 'loop' ? [operation.predicate.source]
        : operation.kind === 'switch' || operation.kind === 'artifact' ? [operation.source] : []
      for (const edge of graph.edges.filter(edge => edge.sourceNode === node.id && edge.type === 'flow' && edge.predicate)) sources.push(edge.predicate!.source)
      for (const source of sources) if (source.kind === 'data' && !node.ports.some(port => port.id === source.portId && port.direction === 'input' && port.kind === 'data')) add(id, node.id, 'data-source-port', 'Операция ссылается на отсутствующий вход Data.')
      if (node.type === 'trigger' && node.config.triggerType !== (operation.kind === 'telegram-message' ? 'message' : operation.kind)) add(id, node.id, 'trigger-type', 'Тип Trigger должен совпадать с выбранной операцией.')
      if (node.type === 'data' && node.config.dataType && node.config.dataType !== 'json') add(id, node.id, 'data-type', 'Доступна только обработка JSON; чтение файлов и баз пока не исполняется.')
      if (node.type === 'logic') {
        if (node.config.logicType && node.config.logicType !== operation.kind) add(id, node.id, 'logic-type', 'Тип Logic не совпадает с выбранной операцией.')
        if (node.config.expression?.trim() || node.config.conditions?.length || node.config.branches?.length) add(id, node.id, 'legacy-expression', 'Замените текстовые expressions/conditions/branches декларативной операцией.')
      }
      if (node.type === 'data' && (node.config.source?.trim() || node.config.persistence?.trim())) add(id, node.id, 'external-data', 'Внешний source/persistence не поддерживается локальным преобразованием.')
      if (node.type === 'artifact' && node.config.storageTarget?.trim() && node.config.storageTarget !== 'local') add(id, node.id, 'storage-target', 'Доступен только локальный артефакт с явным сохранением пользователем.')
      if ('execution' in node.config && node.config.execution) {
        const execution = node.config.execution
        if (execution.retries || execution.fallbackNodeId || execution.errorPolicy?.trim()) add(id, node.id, 'execution-policy', 'Повторы, fallback и текстовая error policy пока не исполняются.')
        if (execution.timeoutMs && operation.kind === 'human' && execution.timeoutMs !== operation.timeoutMs) add(id, node.id, 'human-timeout', 'Timeout Human должен совпадать с настройкой операции.')
      }
      for (const key of ['input', 'output', 'schema', 'payload', 'response'] as const) if (key in node.config) contract((node.config as Record<string, Contract | undefined>)[key], id, node.id)
      for (const port of node.ports) contract(port.contract, id, node.id)
      let branchPorts: string[] = []
      if (operation.kind === 'if') branchPorts = [operation.truePortId, operation.falsePortId]
      if (operation.kind === 'loop') branchPorts = [operation.bodyPortId, operation.exitPortId]
      if (operation.kind === 'switch') {
        branchPorts = [...operation.cases.map(item => item.portId), operation.defaultPortId]
        if (operation.cases.some((item, index) => operation.cases.slice(0, index).some(other => jsonEqual(item.value, other.value)))) add(id, node.id, 'duplicate-case', 'Значения switch должны различаться.')
      }
      if (new Set(branchPorts).size !== branchPorts.length) add(id, node.id, 'branch-ports', 'Каждый исход условия должен использовать отдельный порт.')
      for (const portId of branchPorts) {
        if (!node.ports.some(port => port.id === portId && port.direction === 'output' && port.kind === 'flow')) add(id, node.id, 'branch-port', 'Выход условия ссылается на отсутствующий Flow-порт.')
        if (!graph.edges.some(edge => edge.sourceNode === node.id && edge.sourcePort === portId && edge.type === 'flow' && active.has(edge.targetNode))) add(id, node.id, 'unconnected-branch', 'Подключите все исходы ветвления, включая выход из цикла.')
      }
      if (branchPorts.length && graph.edges.some(edge => edge.sourceNode === node.id && edge.type === 'flow' && (!edge.sourcePort || !branchPorts.includes(edge.sourcePort)))) add(id, node.id, 'ambiguous-branch', 'Исходящая Flow-связь не назначена исходу условия.')
      if (node.type === 'subworkflow') {
        const nested = project.subworkflows.find(graph => graph.id === node.config.subworkflowId)
        if (!nested || !nested.nodes.some(node => node.type !== 'note' && node.status !== 'disabled')) add(id, node.id, 'empty-subworkflow', 'Subworkflow должен содержать исполнимые узлы.')
        for (const direction of ['input', 'output']) if (!node.ports.some(port => port.direction === direction && port.kind === 'flow')) add(id, node.id, 'subworkflow-boundary', 'Subworkflow требует открытые вход и выход Flow.')
        for (const port of node.ports.filter(port => port.kind === 'flow' || port.kind === 'data')) {
          const bound = nested?.nodes.find(item => item.id === port.binding?.nodeId)
          if (!bound || bound.status === 'disabled' || bound.type === 'note' || !port.binding?.portId) add(id, node.id, 'subworkflow-binding', 'Каждый исполняемый открытый порт должен быть привязан к включённому внутреннему порту.')
        }
        const destinations = node.ports.filter(port => port.direction === 'input' && port.kind === 'data' && port.binding).map(port => `${port.binding!.nodeId}:${port.binding!.portId}`)
        if (new Set(destinations).size !== destinations.length) add(id, node.id, 'boundary-data-writers', 'Внутренний вход Data не может иметь два внешних источника.')
      }
    }
    for (const edge of graph.edges) {
      if (!active.has(edge.sourceNode) && !active.has(edge.targetNode)) continue
      if (edge.type === 'reference') {
        if (edge.predicate || edge.condition?.trim()) add(id, edge.id, 'reference-condition', 'Reference не исполняет условия.')
        continue
      }
      if (edge.type === 'tool-access') {
        const source = active.get(edge.sourceNode), target = active.get(edge.targetNode)
        if (source?.type !== 'agent' || target?.type !== 'tool' || !['text-statistics', 'connector'].includes(target.operation?.kind ?? '')) add(id, edge.id, 'tool-access', 'Исполняемый Tool access идёт от включённого Agent к настроенному Tool.')
        if (edge.predicate || edge.condition?.trim()) add(id, edge.id, 'tool-condition', 'Tool access не исполняет условия.')
        if (!edge.sourcePort || !edge.targetPort) add(id, edge.id, 'explicit-ports', 'Для Tool access укажите оба порта.')
        contract(edge.contract, id, edge.id)
        continue
      }
      if (!active.has(edge.sourceNode) || !active.has(edge.targetNode)) add(id, edge.id, 'disabled-endpoint', 'Исполняемая связь не может пересекать отключённый узел.')
      if (!edge.sourcePort || !edge.targetPort) add(id, edge.id, 'explicit-ports', 'Для выполнения укажите оба порта связи.')
      if (edge.condition?.trim()) add(id, edge.id, 'text-condition', 'Текстовое условие не исполняется: настройте структурированное условие связи.')
      if (edge.type === 'data' && edge.predicate) add(id, edge.id, 'data-condition', 'Условия поддерживаются только на Flow-связях.')
      contract(edge.contract, id, edge.id)
    }
    for (const node of enabled) {
      const targetPorts = graph.edges.filter(edge => edge.type === 'data' && edge.targetNode === node.id).map(edge => edge.targetPort)
      if (new Set(targetPorts).size !== targetPorts.length) add(id, node.id, 'data-writers', 'Вход Data должен иметь только один источник.')
    }
    if (hasUnguardedCycle(graph, active)) add(id, id ?? project.project.id, 'unbounded-cycle', 'Цикл должен проходить через выход тела явно ограниченного Loop.')
  }
  if (diagnostics.some(issue => issue.severity === 'error')) return { ok: false, diagnostics }
  const plan: ExecutionPlan = { planVersion: '0.5', id: createId(), createdAt: new Date().toISOString(), entryNodeId, snapshot: structuredClone(project), limits: { maxSteps: 10000, maxDepth: 24, timeoutMs: 300000 } }
  deepFreeze(plan)
  return { ok: true, plan, diagnostics }
}

function hasUnguardedCycle(graph: Graph, active: Map<string, WorkflowNode>): boolean {
  const degrees = new Map([...active.keys()].map(id => [id, 0]))
  const outgoing = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (edge.type !== 'flow' || !active.has(edge.sourceNode) || !active.has(edge.targetNode)) continue
    const operation = active.get(edge.sourceNode)?.operation
    if (operation?.kind === 'loop' && edge.sourcePort === operation.bodyPortId) continue
    outgoing.set(edge.sourceNode, [...(outgoing.get(edge.sourceNode) ?? []), edge.targetNode])
    degrees.set(edge.targetNode, degrees.get(edge.targetNode)! + 1)
  }
  const queue = [...degrees].filter(([, count]) => count === 0).map(([id]) => id)
  for (let index = 0; index < queue.length; index++) for (const target of outgoing.get(queue[index]!) ?? []) {
    const count = degrees.get(target)! - 1; degrees.set(target, count)
    if (count === 0) queue.push(target)
  }
  return queue.length !== active.size
}

function deepFreeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze) }
}
