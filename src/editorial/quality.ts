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

import { countWords } from '../ai/agent'
import { editorialTaskSchema, type EditorialIssue, type EditorialTask } from './schema'

export interface FormalReview {
  words: number
  sections: number
  issues: EditorialIssue[]
}

/** Formal checks cannot certify facts, marketing quality or the meaning of citations. */
export function checkEditorialText(options: {
  task: EditorialTask; text: string; finish: 'stop' | 'length' | 'manual'
  allowedSourceIds: readonly string[]; knowledgeGaps: readonly string[]
}): FormalReview {
  const task = editorialTaskSchema.parse(options.task)
  const { text } = options
  const words = countWords(text)
  const sections = (text.match(/^##\s+\S.*$/gm) ?? []).length
  const issues: EditorialIssue[] = []
  const issue = (code: EditorialIssue['code'], message: string) => issues.push({ code, message, origin: 'program' })
  if (options.finish === 'length') issue('incomplete', 'Модель остановилась по лимиту ответа. Сохранённый текст может быть незавершённым.')
  if (!text.trim()) issue('empty', 'Модель не вернула текст.')
  if (words < task.minimumWords) issue('volume', `Получено ${words} слов; требуется минимум ${task.minimumWords}.`)
  if (!/^#\s+\S.*$/m.test(text) || sections < 2) issue('structure', 'Нужны заголовок статьи (#) и хотя бы два тематических раздела (##).')
  // Only explicit machine-readable references are validated. Arbitrary prose is not a citation.
  const references = [...text.matchAll(/\[source:([^\]\r\n]+)\]/g)].map(match => match[1]!.trim())
  for (const reference of new Set(references)) if (!options.allowedSourceIds.includes(reference)) issue('source-reference', `Источник «${reference.slice(0, 200)}» отсутствует в выбранном досье.`)
  for (const gap of options.knowledgeGaps.slice(0, 20)) issue('knowledge-gap', gap.slice(0, 4000) || 'В досье недостаточно сведений.')
  return { words, sections, issues }
}
