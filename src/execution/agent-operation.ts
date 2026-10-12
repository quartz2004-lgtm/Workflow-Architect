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

export type ProviderResolver = (model: string) => ModelProvider
export async function executeAgentOperation(options: {
  node: WorkflowNode; project: Project; graph: Graph; input: JsonValue; data: ReadonlyMap<string, JsonValue>
  outputs: ReadonlyMap<string, ReadonlyMap<string, JsonValue>>; tokenBudget: number; timeoutMs: number
  provider: ProviderResolver; signal: AbortSignal; trace: (event: AgentTrace) => void
}): Promise<JsonValue> {
  const { node, project, graph, input, data, outputs } = options
  if (node.type !== 'agent' || node.operation?.kind !== 'agent' || !node.config.model) throw new Error('Недоступная операция Agent.')
  const config = node.config, operation = node.operation
  const context: Record<string, JsonValue> = {}
  for (const id of config.context?.attachedNodeIds ?? []) {
    const ports = outputs.get(id)
    if (!ports?.size) throw new Error(`Источник контекста ${id} ещё не выполнен.`)
    context[id] = Object.fromEntries(ports)
  }
  const previous = config.context?.memory === 'run' ? outputs.get(node.id)?.values().next().value : undefined
  const prompt = config.promptId ? project.prompts.find(prompt => prompt.id === config.promptId)?.content : config.systemPrompt
  const system = [config.role, prompt, ...(config.behavioralRules ?? []), config.context?.knowledge, config.context?.policy].filter(Boolean).join('\n\n')
  const tools = agentTools(graph, node).map(tool => {
    if (tool.operation?.kind !== 'text-statistics') throw new Error('Недоступный инструмент.')
    const name = `tool_${tool.id.replaceAll('-', '_')}`
    const builtIn = createTextTool(name, typeof input === 'string' ? input : JSON.stringify(input), tool.operation.minimumWords)
    return { ...builtIn, description: `${tool.title.slice(0, 200)}. ${builtIn.description}` }
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
