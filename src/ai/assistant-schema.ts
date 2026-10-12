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
import { answersSchema, preferencesSchema } from '../profiles/schema'

export const designProposalSchema = z.strictObject({
  message: z.string().min(1).max(4000),
  questions: z.array(z.string().min(1).max(500)).max(3),
  nodes: z.array(z.strictObject({ key: z.number().int().min(0).max(11), type: z.enum(['concept', 'trigger', 'agent', 'tool', 'artifact']),
    title: z.string().min(1).max(150), description: z.string().max(2000), role: z.string().max(500), systemPrompt: z.string().max(6000),
  })).max(12),
  edges: z.array(z.strictObject({ source: z.number().int().min(0).max(11), target: z.number().int().min(0).max(11), type: z.enum(['flow', 'tool-access']) })).max(24),
})
export const suggestedPreferencesSchema = preferencesSchema.pick({ detail: true, density: true, motion: true, defaultMode: true })
  .extend({ favoriteTemplates: z.array(z.enum(['research', 'content', 'automation'])).max(3) })
export const personalizationSchema = z.strictObject({
  analysis: z.string().min(1).max(4000),
  options: z.array(z.strictObject({ title: z.string().min(1).max(150), explanation: z.string().min(1).max(2000), preferences: suggestedPreferencesSchema })).min(2).max(3),
})
export const assistantInputSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('design'), conversation: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: z.string().max(12000) })).min(1).max(12), graphSummary: z.string().max(12000) }),
  z.strictObject({ mode: z.literal('personalize'), answers: answersSchema, preferences: preferencesSchema, trial: z.string().min(1).max(12000) }),
  z.strictObject({ mode: z.literal('test') }),
])
export type DesignProposal = z.infer<typeof designProposalSchema>
export type Personalization = z.infer<typeof personalizationSchema>
export type AssistantInput = z.infer<typeof assistantInputSchema>
