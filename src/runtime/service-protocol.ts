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
import { runtimeProfileSchema, submitJobSchema } from './job-schema'
import { assertValueBudget } from '../execution/values'
import { aiCommandSchema } from '../ai/protocol'
import { integrationCommandSchema } from '../integrations/protocol'

const owned = { profileId: runtimeProfileSchema, id: z.uuid() }
export const runtimeCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('integrations'), command: integrationCommandSchema }),
  z.strictObject({ kind: z.literal('ai'), command: aiCommandSchema }),
  z.strictObject({ kind: z.literal('submit'), request: submitJobSchema }),
  z.strictObject({ kind: z.literal('list'), profileId: runtimeProfileSchema }),
  ...(['get', 'cancel', 'resume', 'remove'] as const).map(kind => z.strictObject({ kind: z.literal(kind), ...owned })),
  z.strictObject({ kind: z.literal('answer'), ...owned, requestId: z.uuid(), value: z.json() }),
])
export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>
export const serviceCommandSchema = z.union([runtimeCommandSchema, z.strictObject({ kind: z.enum(['stop', 'close-window', 'wake']) })])
export const serviceRequestSchema = z.strictObject({ version: z.literal('0.3.1'), requestId: z.uuid(), command: serviceCommandSchema })
export function parseServiceRequest(value: unknown) {
  assertValueBudget(value, 24 * 1024 * 1024, true)
  return serviceRequestSchema.parse(value)
}
