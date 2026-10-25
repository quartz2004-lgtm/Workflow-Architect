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

/** A finite task budget independent from any provider or Canvas implementation. */
export const editorialBudgetSchema = z.strictObject({
  maxRevisions: z.number().int().min(1).max(3),
  timeoutMs: z.number().int().min(1000).max(3600000),
  maxTotalTokens: z.number().int().min(1024).max(262144),
})
export const defaultEditorialBudget = editorialBudgetSchema.parse({ maxRevisions: 3, timeoutMs: 1800000, maxTotalTokens: 131072 })
