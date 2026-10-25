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

import type { JsonValue } from '../domain/execution-config'
import type { Graph, Project, WorkflowNode } from '../domain/schema'
import { runAgent, type AgentTrace } from '../ai/agent'
import { createTextTool } from '../ai/text-tool'
import type { ModelProvider } from '../ai/types'
import { agentTools } from './ai-plan'
import { resolveContract } from './compiler'
import { compileContract } from './contracts'
import { z } from 'zod'
import { actionArgumentsSchemas } from '../integrations/schema'
import { connectorArguments, type ConnectorExecutor } from './connector-operation'
import type { AgentTool } from '../ai/agent'

export type ProviderResolver = (model: string) => ModelProvider
export async function executeAgentOperation(options: {
  node: WorkflowNode; project: Project; graph: Graph; input: JsonValue; data: ReadonlyMap<string, JsonValue>
  outputs: ReadonlyMap<string, ReadonlyMap<string, JsonValue>>; tokenBudget: number; timeoutMs: number
  provider: ProviderResolver; signal: AbortSignal; trace: (event: AgentTrace) => void
  connector?: ConnectorExecutor; effectPrefix?: string
}): Promise<JsonValue> {
  const { node, project, graph, input, data, outputs } = options
  if (node.type !== 'agent' || node.operation?.kind !== 'agent' || !node.config.model) throw new Error('Недоступная операция Agent.')
  const config = node.config, operation = node.operation
  if (operation.knowledge && (operation.knowledge.collections.length || operation.knowledge.imageIds.length)) throw new Error('Источники Agent требуют runtime с подготовленным пакетом контекста. Запуск без выбранных знаний запрещён.')
  const context: Record<string, JsonValue> = {}
  for (const id of config.context?.attachedNodeIds ?? []) {
    const ports = outputs.get(id)
    if (!ports?.size) throw new Error(`Источник контекста ${id} ещё не выполнен.`)
    context[id] = Object.fromEntries(ports)
  }
  const previous = config.context?.memory === 'run' ? outputs.get(node.id)?.values().next().value : undefined
  const prompt = [config.promptId ? project.prompts.find(prompt => prompt.id === config.promptId)?.content : '', config.systemPrompt].filter(Boolean).join('\n\n')
  const system = [config.role, prompt, ...(config.behavioralRules ?? []), config.context?.knowledge, config.context?.policy].filter(Boolean).join('\n\n')
  let externalCall = 0
  const tools = agentTools(graph, node).map((tool, index) => {
    if (tool.operation?.kind !== 'text-statistics' && tool.operation?.kind !== 'connector') throw new Error('Недоступный инструмент.')
    // Provider-facing names are short semantic aliases; durable permissions still use node UUIDs.
    const name = tool.operation.kind === 'connector' ? `connector_${index + 1}` : `text_statistics_${index + 1}`
    const operation = tool.operation
    let builtIn: AgentTool
    if (operation.kind === 'text-statistics') builtIn = createTextTool(name, typeof input === 'string' ? input : JSON.stringify(input), operation.minimumWords)
    else {
      const fixed = connectorArguments(operation, input, data)
      const parameters = z.toJSONSchema(actionArgumentsSchemas[operation.action]) as Record<string, JsonValue>
      delete parameters.$schema
      if (Array.isArray(parameters.required)) parameters.required = parameters.required.filter(key => typeof key === 'string' && !Object.hasOwn(fixed, key))
      builtIn = { name, description: `Выполнить ${operation.action}. Поля, заданные в настройках узла, фиксированы.`, parameters,
        execute: async (args, signal) => {
          if (!options.connector || !options.effectPrefix) throw new Error('Нет разрешённого runtime для подключения.')
          return options.connector(operation.connectionId, `${options.effectPrefix}:tool:${externalCall++}`, operation.action, { ...args, ...fixed }, signal)
        },
      }
    }
    if (tool.type !== 'tool') throw new Error('Ожидался Tool.')
    const links = graph.edges.filter(edge => edge.type === 'tool-access' && edge.sourceNode === node.id && edge.targetNode === tool.id)
    const before = [tool.config.input, ...links.flatMap(edge => [edge.contract, node.ports.find(port => port.id === edge.sourcePort)?.contract, tool.ports.find(port => port.id === edge.targetPort)?.contract])]
      .flatMap(contract => { const schema = contract ? resolveContract(contract, project) : undefined; return schema === undefined ? [] : [compileContract(schema)] })
    const output = tool.config.output ? resolveContract(tool.config.output, project) : undefined
    const after = output === undefined ? undefined : compileContract(output)
    return { ...builtIn, description: `${tool.title.slice(0, 200)}. ${builtIn.description}`,
      async execute(args: Record<string, JsonValue>, signal: AbortSignal) {
        if (before.some(check => check(args).length)) throw new Error(`Вход инструмента ${tool.title} не соответствует контракту.`)
        const result = await builtIn.execute(args, signal)
        if (after?.(result).length) throw new Error(`Выход инструмента ${tool.title} не соответствует контракту.`)
        return result
      },
    }
  })
  const outputContract = config.output ? resolveContract(config.output, project) : undefined
  if (typeof outputContract === 'boolean') throw new Error('Structured output Agent требует объект JSON Schema.')
  const result = await runAgent(options.provider(config.model!.name), {
    model: config.model!.name, system,
    input: data.size || Object.keys(context).length || previous !== undefined ? { input, data: Object.fromEntries(data), context, ...(previous !== undefined ? { previous } : {}) } : input,
    limits: { ...operation.limits, maxTotalTokens: Math.min(operation.limits.maxTotalTokens, options.tokenBudget), timeoutMs: Math.min(operation.limits.timeoutMs, options.timeoutMs) },
    temperature: typeof config.model!.parameters?.temperature === 'number' ? config.model!.parameters.temperature : 0.3,
    tools, requiredTools: operation.requireTools ? tools.map(tool => tool.name) : [], outputSchema: outputContract, minimumWords: operation.minimumWords,
  }, options.signal, options.trace)
  return result.output
}
