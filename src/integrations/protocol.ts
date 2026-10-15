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
import { profileIds } from '../profiles/schema'
import { integrationConnectionSchema } from './schema'
import { publishedWorkflowSchema, telegramBindingSchema, scheduleSchema } from './source-schema'

const owner = { profileId: z.enum(profileIds) }
export const integrationCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('list'), ...owner }),
  z.strictObject({ action: z.literal('save'), connection: integrationConnectionSchema }),
  ...(['remove', 'check', 'pair', 'disable-workflow', 'remove-binding', 'remove-schedule', 'workflow-details', 'test-chat'] as const).map(action => z.strictObject({ action: z.literal(action), ...owner, id: z.uuid() })),
  z.strictObject({ action: z.literal('publish'), ...owner, label: z.string().min(1).max(100), project: z.unknown(), entryNodeId: z.uuid() }),
  z.strictObject({ action: z.literal('preflight'), ...owner, project: z.unknown(), entryNodeId: z.uuid() }),
  z.strictObject({ action: z.literal('activate'), ...owner, bindingId: z.uuid(), expectedWorkflowId: z.uuid().nullable(), label: z.string().min(1).max(100), project: z.unknown(), entryNodeId: z.uuid() }),
  z.strictObject({ action: z.literal('select-workflow'), ...owner, bindingId: z.uuid(), workflowId: z.uuid().nullable() }),
  z.strictObject({ action: z.literal('schedule'), ...owner, workflowId: z.uuid(), intervalMinutes: z.number().int().min(1).max(525600), input: z.json() }),
])
export type IntegrationCommand = z.infer<typeof integrationCommandSchema>
export const integrationStateSchema = z.strictObject({
  connections: z.array(integrationConnectionSchema), damaged: z.array(z.string()),
  workflows: z.array(publishedWorkflowSchema.omit({ project: true })),
  schedules: z.array(scheduleSchema.extend({ problem: z.string() })),
  telegram: z.strictObject({ bindings: z.array(telegramBindingSchema), problems: z.array(z.strictObject({ connectionId: z.uuid(), message: z.string(), listening: z.boolean() })), failures: z.array(z.strictObject({ id: z.uuid(), updateId: z.number(), error: z.string() })) }),
  effects: z.array(z.strictObject({ id: z.uuid(), key: z.string(), status: z.enum(['pending', 'unknown']) })),
})
export type IntegrationState = z.infer<typeof integrationStateSchema>
