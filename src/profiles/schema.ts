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

export const profileIds = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'] as const
export const preferencesSchema = z.object({
  detail: z.enum(['guided', 'technical']),
  density: z.enum(['comfortable', 'compact']),
  motion: z.enum(['system', 'reduced']),
  defaultMode: z.enum(['concept', 'engineering']),
  favoriteTemplates: z.array(z.string().min(1).max(100)).max(30),
  recommendedMaxSteps: z.number().int().min(1).max(1000),
  recommendedMaxCost: z.number().min(0).max(1000),
}).strict()
export const answersSchema = z.object({
  goals: z.string().max(2000), tasks: z.string().max(2000),
  experience: z.enum(['beginner', 'confident', 'advanced']),
  control: z.enum(['manual', 'assisted']), services: z.string().max(2000),
  practice: z.enum(['not-started', 'needs-help', 'completed']),
}).strict()
export const profileSchema = z.object({
  schemaVersion: z.literal('0.1'), id: z.enum(profileIds), revision: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(80),
  onboarding: z.enum(['new', 'skipped', 'completed']),
  answers: answersSchema, preferences: preferencesSchema,
}).strict()
export type Profile = z.infer<typeof profileSchema>
export type ProfilePreferences = z.infer<typeof preferencesSchema>
export type SetupAnswers = z.infer<typeof answersSchema>

export function createProfile(index: 0 | 1): Profile {
  return profileSchema.parse({
    schemaVersion: '0.1', id: profileIds[index], revision: 0, name: `Профиль ${index + 1}`, onboarding: 'new',
    answers: { goals: '', tasks: '', experience: 'beginner', control: 'assisted', services: '', practice: 'not-started' },
    preferences: { detail: 'technical', density: 'comfortable', motion: 'system', defaultMode: 'concept', favoriteTemplates: [], recommendedMaxSteps: 20, recommendedMaxCost: 1 },
  })
}
