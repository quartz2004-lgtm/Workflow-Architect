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

import { z } from 'zod'
import { activationSchema, artifactSchema, humanRequestSchema } from './protocol'
import { assertValueBudget } from './values'
import type { ExecutionPlan } from './compiler'
import { aiUsageSchema } from '../ai/trace-schema'

const id = z.uuid()
const values = z.record(id, z.record(id, z.json()))
const token = z.strictObject({ nodeId: id, portId: id.optional(), value: z.json() })
export const checkpointSchema = z.strictObject({
  checkpointVersion: z.enum(['0.3.1', '0.4']), planId: id, runId: id,
  aiUsage: aiUsageSchema.optional(),
  status: z.enum(['queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled']),
  cancelled: z.boolean(), sequence: z.number().int().min(0).max(30000),
  steps: z.number().int().min(0).max(10001), deadline: z.number().int().nonnegative(),
  eventBytes: z.number().int().min(0).max(20 * 1024 * 1024),
  artifacts: z.array(artifactSchema).max(10000),
  frames: z.array(z.strictObject({
    id, graphId: id.nullable(), path: z.array(id).max(24),
    queue: z.array(token).max(10001), outputs: values, data: values,
    loops: z.record(id, z.number().int().min(0).max(100)),
    activation: activationSchema.optional(),
    human: z.strictObject({ request: humanRequestSchema, answer: z.strictObject({ value: z.json() }).optional() }).optional(),
  })).max(25),
})
export type RunCheckpoint = z.infer<typeof checkpointSchema>
export type CheckpointFrame = RunCheckpoint['frames'][number]

/** Checkpoints are local runtime data, never imported as an exportable Project. */
export function parseCheckpoint(value: unknown, plan: ExecutionPlan): RunCheckpoint {
  assertValueBudget(value, 32 * 1024 * 1024, true)
  const saved = checkpointSchema.parse(value)
  if (saved.planId !== plan.id) throw new Error('Контрольная точка относится к другому плану.')
  if (new Set(saved.frames.map(frame => frame.id)).size !== saved.frames.length) throw new Error('Повторный ID вызова контрольной точки.')
  for (let depth = 0; depth < saved.frames.length; depth++) {
    const frame = saved.frames[depth]!
    const graph = frame.graphId === null ? plan.snapshot : plan.snapshot.subworkflows.find(graph => graph.id === frame.graphId)
    if (!graph || frame.path.length !== depth || (depth === 0 && frame.graphId !== null)) throw new Error('Некорректный стек контрольной точки.')
    if (depth > 0) {
      const parent = saved.frames[depth - 1]!
      const parentGraph = parent.graphId === null ? plan.snapshot : plan.snapshot.subworkflows.find(graph => graph.id === parent.graphId)
      const caller = parentGraph?.nodes.find(node => node.id === parent.queue[0]?.nodeId)
      if (caller?.type !== 'subworkflow' || caller.config.subworkflowId !== frame.graphId || !parent.activation
        || JSON.stringify(frame.path) !== JSON.stringify([...parent.path, caller.id])) throw new Error('Нарушена связь вложенных вызовов.')
    }
    for (const item of frame.queue) {
      const node = graph.nodes.find(node => node.id === item.nodeId)
      if (!node || !node.operation || node.status === 'disabled' || (item.portId && !node.ports.some(port => port.id === item.portId && port.direction === 'input' && port.kind === 'flow'))) throw new Error('Некорректная очередь контрольной точки.')
    }
    for (const [kind, entries] of [['output', frame.outputs], ['input', frame.data]] as const) for (const [nodeId, ports] of Object.entries(entries)) {
      const node = graph.nodes.find(node => node.id === nodeId)
      if (!node || Object.keys(ports).some(portId => !node.ports.some(port => port.id === portId && port.direction === kind))) throw new Error('Некорректные данные портов контрольной точки.')
    }
    for (const nodeId of Object.keys(frame.loops)) if (graph.nodes.find(node => node.id === nodeId)?.operation?.kind !== 'loop') throw new Error('Некорректный счётчик Loop.')
    if (frame.activation && (frame.activation.callId !== frame.id || frame.activation.graphId !== frame.graphId || frame.activation.nodeId !== frame.queue[0]?.nodeId
      || JSON.stringify(frame.activation.path) !== JSON.stringify(frame.path))) throw new Error('Некорректная активация контрольной точки.')
    if (frame.human) {
      const node = graph.nodes.find(node => node.id === frame.activation?.nodeId)
      if (!frame.activation || node?.operation?.kind !== 'human' || frame.human.request.mode !== node.operation.mode
        || JSON.stringify(frame.human.request.activation) !== JSON.stringify(frame.activation)
        || Date.parse(frame.human.request.expiresAt) > saved.deadline) throw new Error('Некорректное ожидание Human.')
      if (frame.human.answer && node.operation.mode === 'approval' && typeof frame.human.answer.value !== 'boolean') throw new Error('Некорректный сохранённый ответ Human.')
    }
  }
  return saved
}
