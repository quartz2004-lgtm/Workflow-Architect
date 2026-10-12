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

// Names refer to locally installed models only, never an implicit remote/cloud model.
export const localModelNameSchema = z.string().min(1).max(150)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/)
  .refine(value => !value.includes('..') && !value.includes('://') && !/(?:^|[-:/])cloud(?:$|[-:/])/i.test(value), 'Выберите локальную модель, без cloud и URL.')
export const localConnectionSchema = z.strictObject({
  provider: z.literal('ollama'),
  port: z.number().int().min(1024).max(65535),
  model: localModelNameSchema,
})
export { agentLimitsSchema, defaultAgentLimits, type AgentLimits } from '../domain/agent-config'
export type LocalConnection = z.infer<typeof localConnectionSchema>
