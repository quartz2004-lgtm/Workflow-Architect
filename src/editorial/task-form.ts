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

import { normalizeEditorialTask, type EditorialTask } from './schema'

export type EditorialKind = 'knowledge-answer' | 'article' | 'revision' | 'short-block' | 'content-plan' | 'reels'
export const resultTypes: { kind: EditorialKind; label: string; help: string; minimumWords: number }[] = [
  { kind: 'article', label: 'Статья', help: 'Полный текст: от 600 слов, заголовок и тематические разделы.', minimumWords: 600 },
  { kind: 'knowledge-answer', label: 'Ответ по базе', help: 'Ответ на вопрос по выбранным источникам. Неизвестные сведения не подменяются догадками.', minimumWords: 0 },
  { kind: 'short-block', label: 'Короткий блок · 100–130 слов', help: 'Компактный текст с проверкой нижней и верхней границы объёма.', minimumWords: 100 },
  { kind: 'content-plan', label: 'Контент-план', help: 'Нумерованный список идей. Укажите площадку, аудиторию и цель в задании.', minimumWords: 0 },
  { kind: 'reels', label: 'Сценарии Reels', help: 'Отдельные сценарии по пунктам. Укажите длительность, кадры, реплики и желаемое действие зрителя.', minimumWords: 0 },
  { kind: 'revision', label: 'Правка готового текста', help: 'Вставьте исходный текст и опишите изменения. Результат проходит новую проверку и подтверждение.', minimumWords: 0 },
]

export function taskFromForm(input: { kind: EditorialKind; text: string; audience: string; minimumWords: number; items: number; previousArticle: string }): EditorialTask {
  if (!input.text.trim()) throw new Error('Опишите задачу и пожелания к результату.')
  if (!input.audience.trim()) throw new Error('Укажите, для кого готовится текст.')
  if (input.kind === 'revision' && !input.previousArticle.trim()) throw new Error('Вставьте исходный текст для правки.')
  const floor = input.kind === 'article' ? 600 : 0
  if (!Number.isInteger(input.minimumWords) || input.minimumWords < floor || input.minimumWords > 5000) throw new Error(`Минимальный объём должен быть целым числом от ${floor} до 5000 слов.`)
  if (['content-plan', 'reels'].includes(input.kind) && (!Number.isInteger(input.items) || input.items < 1 || input.items > 30)) throw new Error('Укажите от 1 до 30 пунктов.')
  return normalizeEditorialTask({ schemaVersion: '0.5.5', kind: input.kind, text: input.text, audience: input.audience, language: 'Русский',
    minimumWords: input.kind === 'short-block' ? 100 : input.minimumWords, minimumSections: input.kind === 'article' ? 2 : 0,
    ...(input.kind === 'short-block' ? { maximumWords: 130 } : {}),
    ...(['content-plan', 'reels'].includes(input.kind) ? { requiredItems: input.items } : {}),
    ...(input.previousArticle.trim() ? { previousArticle: input.previousArticle } : {}),
  })
}
