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

import { openDB } from 'idb'
import { preferencesSchema, profileIds, type ProfilePreferences } from '../profiles/schema'
import { z } from 'zod'

const database = () => openDB('workflow-architect-ai-preferences', 1, { upgrade(db) { db.createObjectStore('originals') } })
export async function readOriginalPreferences(profileId: string): Promise<ProfilePreferences | null> {
  z.enum(profileIds).parse(profileId)
  const db = await database()
  try { const value = await db.get('originals', profileId); return value === undefined ? null : preferencesSchema.parse(value) }
  finally { db.close() }
}
/** Preserve the first pre-AI settings, including across dialog and application restarts. */
export async function preserveOriginalPreferences(profileId: string, value: ProfilePreferences): Promise<ProfilePreferences> {
  z.enum(profileIds).parse(profileId); const parsed = preferencesSchema.parse(value), db = await database()
  try {
    const transaction = db.transaction('originals', 'readwrite'), existing = await transaction.store.get(profileId)
    if (existing === undefined) await transaction.store.add(parsed, profileId)
    await transaction.done
    return existing === undefined ? parsed : preferencesSchema.parse(existing)
  } finally { db.close() }
}
