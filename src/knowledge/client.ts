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
import { knowledgeCommandSchema, type KnowledgeCommand } from './schema'
const reply = z.discriminatedUnion('ok', [z.strictObject({ ok: z.literal(true), value: z.unknown() }), z.strictObject({ ok: z.literal(false), message: z.string() })])
export async function knowledgeRequest(command: KnowledgeCommand): Promise<unknown> {
  const bridge = window.workflowDesktop?.knowledge
  if (!bridge) throw new Error('База знаний доступна в Windows-приложении.')
  const result = reply.parse(await bridge.request(knowledgeCommandSchema.parse(command)))
  if (!result.ok) throw new Error(result.message)
  return result.value
}
