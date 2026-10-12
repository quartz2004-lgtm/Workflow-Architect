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

const profileId = z.enum(profileIds)
const owned = { profileId, id: z.uuid() }
export const credentialMetadataSchema = z.strictObject({
  ...owned, label: z.string().trim().min(1).max(100), service: z.string().trim().min(1).max(100),
  enabled: z.boolean(), revision: z.number().int().nonnegative(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
})
export type CredentialMetadata = z.infer<typeof credentialMetadataSchema>
export const credentialRecordSchema = credentialMetadataSchema.extend({ recordVersion: z.literal('0.3.1'), ciphertext: z.string().min(1).max(40000).regex(/^[A-Za-z0-9+/]+={0,2}$/) })
export type CredentialRecord = z.infer<typeof credentialRecordSchema>
export const credentialViewSchema = credentialMetadataSchema.extend({ available: z.boolean() })
export type CredentialView = z.infer<typeof credentialViewSchema>
export const credentialCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('status') }),
  z.strictObject({ kind: z.literal('list'), profileId }),
  z.strictObject({ kind: z.literal('create'), ...owned, label: credentialMetadataSchema.shape.label, service: credentialMetadataSchema.shape.service, secret: z.string().min(1).max(8192), enabled: z.boolean() }),
  z.strictObject({ kind: z.literal('set-enabled'), ...owned, enabled: z.boolean() }),
  z.strictObject({ kind: z.literal('remove'), ...owned }),
  z.strictObject({ kind: z.literal('copy-reference'), ...owned }),
])
export type CredentialCommand = z.infer<typeof credentialCommandSchema>
