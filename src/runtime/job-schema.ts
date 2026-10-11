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
import { projectSchema } from '../domain/schema'
import { checkpointSchema } from '../execution/checkpoint'
import { runEventSchema, runOutcomeSchema } from '../execution/protocol'
import { profileIds } from '../profiles/schema'

export const runtimeProfileSchema = z.enum(profileIds)
export const submitJobSchema = z.strictObject({
  id: z.uuid(), profileId: runtimeProfileSchema, eventKey: z.string().min(1).max(128),
  project: z.unknown(), entryNodeId: z.uuid(), input: z.json(), background: z.boolean(),
})
export type SubmitJob = z.infer<typeof submitJobSchema>
export const executionPlanSchema = z.strictObject({
  planVersion: z.literal('0.3'), id: z.uuid(), createdAt: z.iso.datetime(), entryNodeId: z.uuid(), snapshot: projectSchema,
  limits: z.strictObject({ maxSteps: z.literal(10000), maxDepth: z.literal(24), timeoutMs: z.literal(300000) }),
})
export const jobSchema = z.strictObject({
  recordVersion: z.literal('0.3.1'), id: z.uuid(), profileId: runtimeProfileSchema,
  eventKey: z.string().min(1).max(128), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), background: z.boolean(),
  plan: executionPlanSchema, input: z.json(),
  status: z.enum(['queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled', 'interrupted']),
  cancelRequested: z.boolean(), attempts: z.number().int().min(0).max(3),
  deadline: z.number().int().positive(), retryAt: z.number().int().nonnegative(),
  message: z.string().max(4000), checkpoint: checkpointSchema.nullable(),
  events: z.array(runEventSchema).max(30000), outcome: runOutcomeSchema.nullable(),
})
export type RuntimeJob = z.infer<typeof jobSchema>
export const terminalJob = (job: RuntimeJob) => ['succeeded', 'failed', 'cancelled'].includes(job.status)
