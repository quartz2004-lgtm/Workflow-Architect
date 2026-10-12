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
import { localConnectionSchema } from './schema'
import { assistantInputSchema } from './assistant-schema'
import { agentTraceSchema } from './trace-schema'

export const storedConnectionSchema = z.strictObject({ version: z.literal('0.4'), profileId: z.enum(profileIds), enabled: z.boolean(), configuration: localConnectionSchema })
export const connectionStateSchema = z.strictObject({ connection: storedConnectionSchema.nullable(), problem: z.string().max(4000) })
export const assistantTaskSchema = z.strictObject({
  id: z.uuid(), profileId: z.enum(profileIds), status: z.enum(['running', 'succeeded', 'failed', 'cancelled']), mode: z.enum(['design', 'personalize', 'test']),
  result: z.json().nullable(), message: z.string().max(4000), trace: z.array(agentTraceSchema).max(100),
})
const profileId = z.enum(profileIds)
export const aiCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('state'), profileId }),
  z.strictObject({ action: z.literal('save'), profileId, configuration: localConnectionSchema, enabled: z.boolean() }),
  z.strictObject({ action: z.literal('models'), profileId, port: z.number().int().min(1024).max(65535) }),
  z.strictObject({ action: z.literal('start'), profileId, input: assistantInputSchema }),
  z.strictObject({ action: z.enum(['get', 'cancel', 'remove']), profileId, id: z.uuid() }),
])
export type AiCommand = z.infer<typeof aiCommandSchema>
export type AssistantTask = z.infer<typeof assistantTaskSchema>
