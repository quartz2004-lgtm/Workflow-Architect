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

const call = z.number().int().min(1).max(12)
const name = z.string().max(150)
export const agentTraceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('model-start'), call, model: name }),
  z.strictObject({ kind: z.literal('model-finish'), call, model: name, durationMs: z.number().int().nonnegative(), inputTokens: z.number().int().min(0).max(1000000), outputTokens: z.number().int().min(0).max(1000000), costUsd: z.number().finite().min(0), finish: z.enum(['stop', 'length']) }),
  z.strictObject({ kind: z.literal('tool-start'), call, name, arguments: z.record(z.string(), z.json()) }),
  z.strictObject({ kind: z.literal('tool-finish'), call, name, result: z.json() }),
])
export const aiUsageSchema = z.strictObject({ inputTokens: z.number().int().min(0).max(10000000), outputTokens: z.number().int().min(0).max(10000000), costUsd: z.number().finite().min(0), calls: z.number().int().min(0).max(100), toolCalls: z.number().int().min(0).max(200) })
export type AiUsage = z.infer<typeof aiUsageSchema>
