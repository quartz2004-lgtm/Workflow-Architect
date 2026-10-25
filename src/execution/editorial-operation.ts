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

import type { WorkflowNode } from '../domain/schema'
import type { JsonValue } from '../domain/execution-config'
import type { ModelProvider } from '../ai/types'
import type { ContextPacket } from '../knowledge/context'
import type { EditorialState } from '../editorial/engine-schema'
import { advanceEditorial, createEditorialState } from '../editorial/engine'
import { normalizeEditorialTask } from '../editorial/schema'
import type { EditorialResult } from '../editorial/result'

/** Same durable editorial route for a manual task and a Telegram message. */
export async function executeEditorialOperation(options: {
  node: WorkflowNode; input: JsonValue; packet: ContextPacket; provider: ModelProvider
  state?: EditorialState; signal: AbortSignal; deadline: number; tokenBudget: number
  save: (state: EditorialState) => Promise<void>; beforeModel: () => void
}): Promise<EditorialResult> {
  const { node, provider, packet } = options
  if (node.type !== 'agent' || node.operation?.kind !== 'agent' || !node.operation.editorial || !node.config.model) throw new Error('Редакционный Agent не настроен.')
  const operation = node.operation, budget = operation.editorial!
  let state = options.state
  const task = normalizeEditorialTask(options.input, operation.minimumWords || 600)
  if (state && JSON.stringify(state.task) !== JSON.stringify(task)) throw new Error('Задание изменилось после сохранённой контрольной точки.')
  if (!state) {
    if (!provider.identity) throw new Error('Подключение не предоставляет digest установленной модели.')
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(Math.max(1, Math.min(30000, options.deadline - Date.now())))])
    options.beforeModel()
    const modelDigest = await provider.identity(node.config.model.name, signal)
    state = await createEditorialState(task, packet, {
      model: node.config.model.name, modelDigest, contextTokens: operation.limits.contextTokens,
      maxOutputTokens: operation.limits.maxOutputTokens,
      temperature: typeof node.config.model.parameters?.temperature === 'number' ? node.config.model.parameters.temperature : 0.3,
      callTimeoutMs: budget.stageTimeoutMs ?? operation.limits.timeoutMs,
    }, { ...budget, maxTotalTokens: Math.min(budget.maxTotalTokens, options.tokenBudget) })
    state.deadline = Math.min(state.deadline, options.deadline)
    await options.save(state)
  }
  while (['planner', 'writer', 'reviewer'].includes(state.phase)) {
    state = await advanceEditorial({ state, packet, provider, signal: options.signal, save: options.save, beforeModel: options.beforeModel })
  }
  if (state.phase !== 'awaiting-human') throw new Error(`${state.phase === 'cancelled' ? 'Задача отменена' : 'Требуется редактура'}: ${state.issues.map(issue => issue.message).join(' ') || 'Откройте сохранённый черновик и историю этапов.'}`)
  const version = state.versions.at(-1)
  if (!version || version.issues.length) throw new Error('Нет проверенной версии для Human.')
  return { kind: 'editorial-result', version }
}
