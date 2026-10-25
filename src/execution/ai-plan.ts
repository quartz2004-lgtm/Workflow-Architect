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

import type { Graph, Project, WorkflowNode } from '../domain/schema'
import { localModelNameSchema } from '../ai/schema'

export function agentTools(graph: Graph, node: WorkflowNode): WorkflowNode[] {
  if (node.type !== 'agent') throw new Error('Ожидался Agent.')
  const ids = node.config.toolIds ?? []
  if (new Set(ids).size !== ids.length || ids.length > 24) throw new Error('Список разрешённых инструментов содержит повторы или превышает 24 записи.')
  const edges = graph.edges.filter(edge => edge.type === 'tool-access' && edge.sourceNode === node.id)
  if (edges.some(edge => !ids.includes(edge.targetNode))) throw new Error('Tool access не даёт разрешение: добавьте инструмент в разрешённый список агента.')
  return ids.map(id => {
    const tool = graph.nodes.find(item => item.id === id)
    if (tool?.type !== 'tool' || tool.status === 'disabled' || !['text-statistics', 'connector'].includes(tool.operation?.kind ?? '')) throw new Error('Агенту разрешены только включённые настроенные инструменты этого графа.')
    if (!edges.some(edge => edge.targetNode === id)) throw new Error('Разрешённый Tool должен быть соединён с Agent связью Tool access.')
    return tool
  })
}

export function validateAgent(project: Project, graph: Graph, node: WorkflowNode): void {
  if (node.type !== 'agent' || node.operation?.kind !== 'agent') throw new Error('Ожидалась операция Agent.')
  if (node.operation.editorial) throw new Error('Редакционный режим ещё не подключён к runtime этой сборки.')
  const config = node.config
  if (config.model?.provider !== 'ollama' || !localModelNameSchema.safeParse(config.model.name).success) throw new Error('Выберите провайдера ollama и локальную модель Agent.')
  if (!config.role?.trim()) throw new Error('Укажите роль Agent.')
  const prompt = [config.promptId ? project.prompts.find(prompt => prompt.id === config.promptId)?.content : '', config.systemPrompt].filter(Boolean).join('\n\n')
  if (!prompt?.trim()) throw new Error('Укажите system prompt или непустой prompt reference.')
  if ([config.role, prompt, ...(config.behavioralRules ?? []), config.context?.knowledge, config.context?.policy].filter(Boolean).join('\n\n').length > 24000) throw new Error('Общие инструкции и знания Agent превышают 24000 символов.')
  const contract = config.output
  const output = contract?.kind === 'json-schema' ? contract.schema : contract?.kind === 'schema-ref' ? project.schemas.find(schema => schema.id === contract.schemaId)?.definition : undefined
  if (typeof output === 'boolean') throw new Error('Structured output Agent требует объект JSON Schema.')
  if (config.model.parameters && Object.keys(config.model.parameters).some(key => key !== 'temperature')) throw new Error('Поддерживается только параметр temperature; остальные лимиты задаются в операции Agent.')
  const temperature = config.model.parameters?.temperature
  if (temperature !== undefined && (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)) throw new Error('Temperature должна быть числом от 0 до 2.')
  if (config.permissions?.length) throw new Error('Свободный текст permissions не исполняется. Разрешите конкретные Tool в списке агента.')
  if (config.context?.memory && config.context.memory !== 'run') throw new Error('Память Agent: пусто (без памяти) или run (предыдущий результат этого узла в текущем запуске).')
  for (const id of config.context?.attachedNodeIds ?? []) if (id === node.id || !graph.nodes.some(item => item.id === id && item.status !== 'disabled')) throw new Error('Контекст должен ссылаться на другой включённый узел этого графа.')
  const tools = agentTools(graph, node)
  if (node.operation.requireTools && !tools.length) throw new Error('Agent требует инструмент, но список разрешений пуст.')
  if (tools.length && (node.operation.limits.maxToolCalls < tools.length && node.operation.requireTools || node.operation.limits.maxCalls < 2)) throw new Error('Лимиты Agent не позволяют выполнить разрешённые инструменты и завершить ответ.')
  if (config.execution?.timeoutMs && config.execution.timeoutMs !== node.operation.limits.timeoutMs) throw new Error('Timeout Agent должен совпадать с лимитом операции.')
  if (node.operation.minimumWords && config.output && config.output.kind !== 'informal') throw new Error('Минимум слов применяется к тексту; для structured output задайте ограничения в JSON Schema.')
}

export interface ParallelRegion { agents: WorkflowNode[]; join: WorkflowNode }
/** Explicit single-agent branches make correlation and joining unambiguous, including in loops. */
export function parallelRegion(graph: Graph, fork: WorkflowNode): ParallelRegion {
  if (fork.operation?.kind !== 'parallel') throw new Error('Ожидалась операция Parallel.')
  const joinId = fork.operation.joinNodeId
  const target = graph.nodes.find(node => node.id === joinId)
  if (target?.type !== 'logic' || target.operation?.kind !== 'merge' || target.status === 'disabled' || target.id === fork.id) throw new Error('Parallel должен ссылаться на включённый Logic / Merge этого графа.')
  const exits = graph.edges.filter(edge => edge.type === 'flow' && edge.sourceNode === fork.id)
  if (exits.length < 2 || exits.length > 8 || new Set(exits.map(edge => edge.targetNode)).size !== exits.length) throw new Error('Parallel требует от 2 до 8 различных ветвей Agent.')
  const agents = exits.map(edge => {
    const node = graph.nodes.find(node => node.id === edge.targetNode)
    if (node?.type !== 'agent' || node.operation?.kind !== 'agent' || node.status === 'disabled') throw new Error('Каждая ветвь Parallel должна содержать один включённый Agent.')
    const incoming = graph.edges.filter(item => item.type === 'flow' && item.targetNode === node.id)
    const outgoing = graph.edges.filter(item => item.type === 'flow' && item.sourceNode === node.id)
    if (incoming.length !== 1 || outgoing.length !== 1 || outgoing[0]!.targetNode !== joinId || edge.predicate || outgoing[0]!.predicate) throw new Error('Ветвь Agent должна идти только от Parallel к назначенному Merge, без условных Flow-связей.')
    return node
  })
  const ids = new Set(agents.map(node => node.id))
  if (graph.edges.some(edge => edge.type === 'flow' && edge.targetNode === joinId && !ids.has(edge.sourceNode))) throw new Error('Merge параллельного участка не принимает посторонние Flow-ветви.')
  if (graph.edges.some(edge => edge.type === 'data' && ids.has(edge.sourceNode) && ids.has(edge.targetNode))) throw new Error('Параллельные агенты не могут читать результаты друг друга до Merge.')
  for (const node of agents) if (node.type === 'agent' && node.config.context?.attachedNodeIds?.some(id => ids.has(id))) throw new Error('Контекст параллельного Agent не может зависеть от соседней ветви.')
  return { agents, join: target }
}
