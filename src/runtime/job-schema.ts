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
import { preparedKnowledgeSchema } from '../knowledge/runtime'

export const runtimeProfileSchema = z.enum(profileIds)
export const submitJobSchema = z.strictObject({
  id: z.uuid(), profileId: runtimeProfileSchema, eventKey: z.string().min(1).max(128),
  project: z.unknown(), entryNodeId: z.uuid(), input: z.json(), background: z.boolean(),
})
export type SubmitJob = z.infer<typeof submitJobSchema>
export const executionPlanSchema = z.strictObject({
  planVersion: z.enum(['0.3', '0.4', '0.5', '0.6']), id: z.uuid(), createdAt: z.iso.datetime(), entryNodeId: z.uuid(), snapshot: projectSchema,
  limits: z.strictObject({ maxSteps: z.literal(10000), maxDepth: z.literal(24), timeoutMs: z.number().int().min(300000).max(7200000) }),
}).refine(plan => plan.planVersion === '0.6' || plan.limits.timeoutMs === 300000, 'Расширенный лимит требует planVersion 0.6.')
export const jobSchema = z.strictObject({
  recordVersion: z.enum(['0.3.1', '0.5.3', '0.5.4']), id: z.uuid(), profileId: runtimeProfileSchema,
  preparedKnowledge: preparedKnowledgeSchema.optional(), knowledgeDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
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
export const jobSummarySchema = jobSchema.pick({ id: true, profileId: true, createdAt: true, updatedAt: true, status: true, background: true, message: true, attempts: true, deadline: true }).extend({ projectName: z.string(), runId: z.uuid().nullable() })
export type JobSummary = z.infer<typeof jobSummarySchema>
export function summarizeJob(job: RuntimeJob): JobSummary {
  return { id: job.id, profileId: job.profileId, createdAt: job.createdAt, updatedAt: job.updatedAt, status: job.status, background: job.background,
    message: job.message, attempts: job.attempts, deadline: job.deadline, projectName: job.plan.snapshot.project.name, runId: job.checkpoint?.runId ?? null }
}
