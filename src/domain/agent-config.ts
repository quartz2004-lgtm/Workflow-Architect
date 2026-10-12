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

export const agentLimitsSchema = z.strictObject({
  maxCalls: z.number().int().min(1).max(12),
  maxToolCalls: z.number().int().min(0).max(24),
  maxOutputTokens: z.number().int().min(64).max(8192),
  maxTotalTokens: z.number().int().min(128).max(131072),
  contextTokens: z.number().int().min(2048).max(32768),
  timeoutMs: z.number().int().min(1000).max(300000),
  maxCostUsd: z.number().finite().min(0).max(100),
})
export const defaultAgentLimits: AgentLimits = {
  maxCalls: 4, maxToolCalls: 4, maxOutputTokens: 4096, maxTotalTokens: 32768,
  contextTokens: 32768, timeoutMs: 180000, maxCostUsd: 0,
}
export type AgentLimits = z.infer<typeof agentLimitsSchema>
