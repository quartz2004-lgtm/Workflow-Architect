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
import { modelImageSchema } from '../ai/images'

export const mediaRecordSchema = z.strictObject({
  schemaVersion: z.literal('0.5.3'), id: z.uuid(), profileId: z.enum(profileIds),
  label: z.string().trim().min(1).max(120), sku: z.string().trim().min(1).max(200),
  createdAt: z.iso.datetime(), enabled: z.boolean(),
  sourceName: z.string().min(1).max(255), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  hash: z.string().regex(/^[a-f0-9]{64}$/), image: modelImageSchema,
})
export const mediaViewSchema = mediaRecordSchema.omit({ image: true }).extend({ width: z.number().int().positive(), height: z.number().int().positive() })
export const mediaListSchema = z.strictObject({ images: z.array(mediaViewSchema).max(128), damaged: z.number().int().nonnegative() })
export type MediaRecord = z.infer<typeof mediaRecordSchema>
export type MediaView = z.infer<typeof mediaViewSchema>
export const imageEvidenceSchema = mediaRecordSchema.pick({ id: true, label: true, sku: true, sourceName: true, sourceHash: true, hash: true, image: true })
export type ImageEvidence = z.infer<typeof imageEvidenceSchema>
