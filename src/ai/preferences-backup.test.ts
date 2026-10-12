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

import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { createProfile, profileIds } from '../profiles/schema'
import { preserveOriginalPreferences, readOriginalPreferences } from './preferences-backup'

it('keeps the first pre-AI preferences across calls and isolates profiles', async () => {
  const preferences = createProfile(0).preferences
  expect(await readOriginalPreferences(profileIds[0])).toBeNull()
  expect(await preserveOriginalPreferences(profileIds[0], preferences)).toEqual(preferences)
  expect(await preserveOriginalPreferences(profileIds[0], { ...preferences, density: 'compact' })).toEqual(preferences)
  expect(await readOriginalPreferences(profileIds[0])).toEqual(preferences)
  expect(await readOriginalPreferences(profileIds[1])).toBeNull()
})
