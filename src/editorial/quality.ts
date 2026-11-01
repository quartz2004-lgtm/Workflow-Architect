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
  const article = task.schemaVersion === '0.5.4' || task.kind === 'article'
  const minimumSections = task.schemaVersion === '0.5.4' ? 2 : task.minimumSections
  if (article && (!/^#\s+\S.*$/m.test(text) || sections < minimumSections)) issue('structure', `Нужны заголовок статьи (#) и хотя бы ${minimumSections} тематических разделов (##).`)
  if (!article && sections < minimumSections) issue('structure', `Нужно хотя бы ${minimumSections} тематических разделов (##).`)
  if (task.schemaVersion === '0.5.5') {
    if (task.maximumWords !== undefined && words > task.maximumWords) issue('volume', `Получено ${words} слов; допускается максимум ${task.maximumWords}.`)
    if (task.requiredItems !== undefined) {
      // A countable representation, not a claim that every idea is useful or unique.
      const items = [...text.matchAll(/^(\d+)\.[ \t]+\S.*$/gm)].map(match => Number(match[1]))
      if (items.length !== task.requiredItems || items.some((number, index) => number !== index + 1)) issue('structure', `Нужен нумерованный список из ${task.requiredItems} пунктов по порядку от 1, без повторов нумерации.`)
    }
  }
  const headings = [...text.matchAll(/^(#{1,6})[ \t]+[^\r\n]+/gm)]
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]!
    const level = heading[1]!.length
    if (level === 1) continue
    let end = text.length
    for (let cursor = index + 1; cursor < headings.length; cursor++) {
      if (headings[cursor]![1]!.length <= level) { end = headings[cursor]!.index; break }
    }
    const body = text.slice(heading.index + heading[0].length, end)
    if (!body.replace(/^#{1,6}[ \t]+[^\r\n]+/gm, '').trim()) {
      issue('structure', `Раздел «${heading[0].replace(/^#{1,6}\s+/, '').slice(0, 160)}» пуст. Добавьте содержание сразу под его заголовком.`)
    }
  }
  const paragraphs = new Set<string>()
  for (const block of text.split(/\r?\n[ \t]*\r?\n/)) {
    const paragraph = block.trim().replace(/\s+/g, ' ')
    if (paragraph.length < 120 || /^#{1,6}[ \t]/.test(paragraph)) continue
    if (paragraphs.has(paragraph)) {
      issue('structure', `Длинный абзац повторяется дословно: «${paragraph.slice(0, 120)}…». Уберите дублирование и сохраните полезный объём.`)
      break
    }
    paragraphs.add(paragraph)
  }
  // Only explicit machine-readable references are validated. Arbitrary prose is not a citation.
  const references = [...text.matchAll(/\[source:([^\]\r\n]+)\]/g)].map(match => match[1]!.trim())
  for (const reference of new Set(references)) if (!options.allowedSourceIds.includes(reference)) issue('source-reference', `Источник «${reference.slice(0, 200)}» отсутствует в выбранном досье.`)
  for (const gap of options.knowledgeGaps.slice(0, 20)) issue('knowledge-gap', gap.slice(0, 4000) || 'В досье недостаточно сведений.')
  return { words, sections, issues }
}
