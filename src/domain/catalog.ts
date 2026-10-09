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
