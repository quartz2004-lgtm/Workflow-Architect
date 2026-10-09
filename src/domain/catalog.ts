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

import type { NodeType } from './schema'

export const nodeCatalog: Record<NodeType, { label: string; icon: string; description: string }> = {
  concept: { label: 'Concept Node', icon: '◇', description: 'Шаг, идея, ответственность' },
  note: { label: 'Заметка', icon: '≡', description: 'Контекст и решения' },
  agent: { label: 'Agent', icon: '✦', description: 'AI-роль и инструкции' },
  tool: { label: 'Tool', icon: '⌁', description: 'Инструмент или API' },
  trigger: { label: 'Trigger', icon: 'ϟ', description: 'Начало workflow' },
  logic: { label: 'Logic', icon: '⋈', description: 'Условия и ветвления' },
  data: { label: 'Data', icon: '▤', description: 'Данные и память' },
  human: { label: 'Human', icon: '◎', description: 'Решение человека' },
  artifact: { label: 'Artifact', icon: '▧', description: 'Результат работы' },
  subworkflow: { label: 'Subworkflow', icon: '▣', description: 'Вложенная система' },
}
export const engineeringTypes = ['agent', 'tool', 'trigger', 'logic', 'data', 'human', 'artifact', 'subworkflow'] as const
export const connectionLabels = { flow: 'Flow', data: 'Data', 'tool-access': 'Tool access', reference: 'Reference' } as const
