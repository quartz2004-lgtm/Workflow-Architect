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
import { editorialBudgetSchema, editorialIssueSchema, editorialTaskSchema, editorialVersionSchema } from './schema'

const time = z.iso.datetime()
const metrics = z.strictObject({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), durationMs: z.number().int().nonnegative() })
export const editorialSettingsSchema = z.strictObject({
  model: z.string().min(1).max(200), modelDigest: z.string().regex(/^[a-f0-9]{64}$/),
  contextTokens: z.number().int().min(2048).max(32768),
  maxOutputTokens: z.number().int().min(128).max(8192),
  temperature: z.number().min(0).max(2),
  callTimeoutMs: z.number().int().min(1000).max(900000),
})
export const editorialCallSchema = z.strictObject({
  id: z.uuid(), stage: z.enum(['planner', 'writer', 'reviewer']), revision: z.number().int().min(0).max(3),
  startedAt: time, completedAt: time.optional(),
  system: z.string().max(24000), prompt: z.string().max(200000),
  settings: editorialSettingsSchema,
  reservedTokens: z.number().int().positive(),
  status: z.enum(['pending', 'complete', 'failed']),
  response: z.string().max(100000).optional(), finish: z.enum(['stop', 'length']).optional(),
  metrics: metrics.optional(), error: z.string().max(4000).optional(),
})
export const editorialStateSchema = z.strictObject({
  schemaVersion: z.literal('0.5.4'), id: z.uuid(), task: editorialTaskSchema,
  contextDigest: z.string().regex(/^[a-f0-9]{64}$/),
  settings: editorialSettingsSchema, budget: editorialBudgetSchema,
  createdAt: time, deadline: z.number().int().positive(),
  phase: z.enum(['planner', 'writer', 'reviewer', 'awaiting-human', 'needs-editing', 'interrupted', 'cancelled']),
  plan: z.string().max(100000), issues: z.array(editorialIssueSchema).max(100),
  calls: z.array(editorialCallSchema).max(7),
  versions: z.array(editorialVersionSchema).max(3),
  spentTokens: z.number().int().nonnegative(),
})
export type EditorialState = z.infer<typeof editorialStateSchema>
export type EditorialSettings = z.infer<typeof editorialSettingsSchema>
export type EditorialCall = z.infer<typeof editorialCallSchema>
