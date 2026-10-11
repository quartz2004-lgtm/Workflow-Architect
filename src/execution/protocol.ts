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
import { assertValueBudget } from './values'

const id = z.uuid()
const time = z.iso.datetime()
const status = z.enum(['queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled'])
const activation = z.strictObject({ id, callId: id, graphId: id.nullable(), nodeId: id, path: z.array(id).max(24) })
const artifact = z.strictObject({ id, activation, filename: z.string().max(150), format: z.enum(['json', 'text']), content: z.string().max(4 * 1024 * 1024) })
const failure = { activation: activation.optional(), message: z.string().max(100000) }
const diagnostic = z.strictObject({ severity: z.enum(['error', 'warning']), graphId: id.nullable(), entityId: z.string(), code: z.string(), message: z.string() })
const eventBase = { runId: id, sequence: z.number().int().positive(), timestamp: time }
const event = z.discriminatedUnion('kind', [
  z.strictObject({ ...eventBase, kind: z.literal('status'), status }),
  z.strictObject({ ...eventBase, kind: z.literal('step-start'), activation, input: z.json(), data: z.record(id, z.json()) }),
  z.strictObject({ ...eventBase, kind: z.literal('step-finish'), activation, output: z.json(), ports: z.record(id, z.json()) }),
  z.strictObject({ ...eventBase, kind: z.literal('human-request'), request: z.strictObject({ id, activation, question: z.string().max(10000), mode: z.enum(['approval', 'input']), expiresAt: time }) }),
  z.strictObject({ ...eventBase, kind: z.literal('human-answer'), requestId: id, value: z.json() }),
  z.strictObject({ ...eventBase, kind: z.literal('artifact'), artifact }),
  z.strictObject({ ...eventBase, kind: z.literal('failure'), ...failure }),
])
export const workerCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('start'), jobId: id, project: z.unknown(), entryNodeId: id, input: z.json() }),
  z.strictObject({ kind: z.literal('cancel'), jobId: id }),
  z.strictObject({ kind: z.literal('answer'), jobId: id, requestId: id, value: z.json() }),
])
export const workerResponseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ready'), jobId: id, runId: id, planId: id, diagnostics: z.array(diagnostic) }),
  z.strictObject({ kind: z.literal('rejected'), jobId: id, diagnostics: z.array(diagnostic) }),
  z.strictObject({ kind: z.literal('event'), jobId: id, event }),
  z.strictObject({ kind: z.literal('complete'), jobId: id, outcome: z.strictObject({ runId: id, planId: id, status, steps: z.number().int().nonnegative(), artifacts: z.array(artifact), error: z.strictObject(failure).optional() }) }),
  z.strictObject({ kind: z.literal('answer-result'), jobId: id, requestId: id, ok: z.boolean(), message: z.string().optional() }),
  z.strictObject({ kind: z.literal('fault'), jobId: id, message: z.string() }),
])
export type WorkerCommand = z.infer<typeof workerCommandSchema>
export type WorkerResponse = z.infer<typeof workerResponseSchema>
export function parseWorkerCommand(value: unknown): WorkerCommand {
  assertValueBudget(value, 20 * 1024 * 1024, true)
  return workerCommandSchema.parse(value)
}
export function parseWorkerResponse(value: unknown): WorkerResponse {
  assertValueBudget(value, 32 * 1024 * 1024, true)
  return workerResponseSchema.parse(value)
}
