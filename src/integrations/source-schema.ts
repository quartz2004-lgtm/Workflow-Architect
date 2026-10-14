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
import { projectSchema } from '../domain/schema'

const owner = { id: z.uuid(), profileId: z.enum(profileIds) }
export const publishedWorkflowSchema = z.strictObject({ ...owner, version: z.literal('0.5'), label: z.string().trim().min(1).max(100), createdAt: z.iso.datetime(), project: projectSchema, entryNodeId: z.uuid(), enabled: z.boolean() })
export type PublishedWorkflow = z.infer<typeof publishedWorkflowSchema>
export const telegramBindingSchema = z.strictObject({ ...owner, version: z.literal('0.5'), connectionId: z.uuid(), botId: z.string(), chatId: z.string(), userId: z.string(), workflowId: z.uuid().nullable(), lastJobId: z.uuid().nullable() })
export type TelegramBinding = z.infer<typeof telegramBindingSchema>
export const scheduleSchema = z.strictObject({ ...owner, version: z.literal('0.5'), workflowId: z.uuid(), intervalMinutes: z.number().int().min(1).max(525600), nextAt: z.number().int().positive(), input: z.json(), enabled: z.boolean() })
export type Schedule = z.infer<typeof scheduleSchema>

