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
export { editorialBudgetSchema, defaultEditorialBudget } from '../domain/editorial-config'

/** Shared by manual input and delivery adapters; transport metadata stays outside. */
export const editorialTaskSchema = z.strictObject({
  schemaVersion: z.literal('0.5.4'),
  text: z.string().trim().min(1, 'Опишите, какой текст нужно подготовить.').max(12000),
  audience: z.string().trim().min(1).max(1000),
  minimumWords: z.number().int().min(100).max(5000),
  language: z.literal('Русский'),
  previousArticle: z.string().max(100000).optional(),
})
export type EditorialTask = z.infer<typeof editorialTaskSchema>

/** The full previous article is stored in task evidence, not charged again to the source packet. */
export function editorialKnowledgeRequest(task: EditorialTask) {
  const title = task.previousArticle?.split('\n').find(line => /^#\s+/.test(line))?.replace(/^#\s+/, '').slice(0, 300)
  return {
    task: JSON.stringify({ schemaVersion: task.schemaVersion, text: task.text, audience: task.audience, minimumWords: task.minimumWords, language: task.language }),
    query: [task.text, title].filter(Boolean).join('\n'),
  }
}

/** Read only explicitly supported legacy fields, never stringify a Telegram envelope. */
export function normalizeEditorialTask(input: unknown, minimumWords = 600): EditorialTask {
  if (typeof input === 'string') return editorialTaskSchema.parse({ schemaVersion: '0.5.4', text: input, audience: 'Общая аудитория', minimumWords, language: 'Русский' })
  const envelope = z.object({
    text: z.string().optional(), topic: z.string().optional(),
    audience: z.string().optional(), minimumWords: z.number().optional(),
    language: z.literal('Русский').optional(), previousArticle: z.string().optional(),
  }).parse(input)
  return editorialTaskSchema.parse({
    schemaVersion: '0.5.4', text: envelope.text ?? envelope.topic ?? '',
    audience: envelope.audience ?? 'Общая аудитория', minimumWords: envelope.minimumWords ?? minimumWords,
    language: envelope.language ?? 'Русский',
    ...(envelope.previousArticle !== undefined ? { previousArticle: envelope.previousArticle } : {}),
  })
}


export const editorialIssueSchema = z.strictObject({
  code: z.enum(['incomplete', 'empty', 'volume', 'structure', 'source-reference', 'knowledge-gap', 'editorial']),
  message: z.string().min(1).max(4000),
  origin: z.enum(['program', 'reviewer']),
})
export type EditorialIssue = z.infer<typeof editorialIssueSchema>
export const editorialReviewSchema = z.strictObject({
  verdict: z.enum(['ready-for-human', 'needs-editing']),
  comments: z.array(z.string().min(1).max(4000)).max(20),
})

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const editorialVersionSchema = z.strictObject({
  id: z.uuid(), taskId: z.uuid(), number: z.number().int().min(1),
  createdAt: z.iso.datetime(), text: z.string().max(100000), digest,
  finish: z.enum(['stop', 'length', 'manual']),
  issues: z.array(editorialIssueSchema).max(100),
})
export type EditorialVersion = z.infer<typeof editorialVersionSchema>
export const editorialApprovalSchema = z.strictObject({
  taskId: z.uuid(), versionId: z.uuid(), digest, approvedAt: z.iso.datetime(),
})
export type EditorialApproval = z.infer<typeof editorialApprovalSchema>
