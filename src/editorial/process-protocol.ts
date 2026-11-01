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
import { processContentSchema, voiceDraftSchema } from './process-schema'

const owner = { profileId: z.enum(profileIds) }
const mutation = { ...owner, revision: z.number().int().nonnegative() }
export const processCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('read'), ...owner }),
  z.strictObject({ action: z.literal('add-example'), ...mutation, example: voiceDraftSchema }),
  z.strictObject({ action: z.literal('accept-example'), ...mutation, exampleId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ action: z.literal('revoke-example'), ...mutation, exampleId: z.uuid() }),
  z.strictObject({ action: z.literal('save-version'), ...mutation, content: processContentSchema }),
  z.strictObject({ action: z.literal('select-version'), ...mutation, versionId: z.uuid().nullable() }),
])
export type ProcessCommand = z.infer<typeof processCommandSchema>
