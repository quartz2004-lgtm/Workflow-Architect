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
import type { EditorialIssue } from './schema'

/** Model wire format only; persisted issues and historical raw replies stay unchanged. */
export const groundedReviewSchema = z.strictObject({
  verdict: z.enum(['ready-for-human', 'needs-editing']),
  comments: z.array(z.strictObject({
    quote: z.string().min(1).max(160),
    sourceIds: z.array(z.string().min(1).max(200)).max(3),
    correction: z.string().min(1).max(200),
  })).max(5),
})

export function reviewIssues(input: unknown, draft: string, allowedSourceIds: readonly string[]): EditorialIssue[] {
  const review = groundedReviewSchema.parse(input)
  if ((review.verdict === 'ready-for-human') !== (review.comments.length === 0)) throw new Error('Вердикт редактора противоречит списку замечаний.')
  return review.comments.map(comment => {
    if (!comment.quote.trim() || !draft.includes(comment.quote)) throw new Error('Цитата редактора отсутствует в проверяемой версии текста.')
    if (comment.sourceIds.some(id => !allowedSourceIds.includes(id))) throw new Error('Редактор сослался на источник вне выбранного досье.')
    return {
      code: 'editorial', origin: 'reviewer',
      message: `${comment.correction} Фрагмент: «${comment.quote}».${comment.sourceIds.length ? ` Источники: ${comment.sourceIds.join(', ')}.` : ' Подтверждение в досье не указано.'}`,
    }
  })
}

