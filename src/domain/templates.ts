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

import { createEdge, createId, createNode, createProject } from './factories'
import type { Contract, NodeType, Project, WorkflowNode } from './schema'

export const templates = [
  { id: 'research', title: 'Multi-agent Research', description: 'Запрос → план → исследование → критика → отчёт', icon: '✦' },
  { id: 'content', title: 'Content Pipeline', description: 'Бриф → исследование → текст → редактура → документ', icon: '▧' },
  { id: 'automation', title: 'Automation Concept', description: 'Webhook → маршрутизация → Agent → согласование → API', icon: 'ϟ' },
] as const
export type TemplateId = typeof templates[number]['id']

/** Fresh IDs per instantiation; examples specify architecture, never execute it. */
export function createTemplate(id: TemplateId): Project {
  const definition = templates.find(template => template.id === id)!
  const project = createProject(definition.title)
  project.project.description = definition.description
  project.settings.defaultMode = id === 'automation' ? 'concept' : 'engineering'
  const contract: Contract = { kind: 'schema-ref', schemaId: createId() }
  project.schemas.push({ id: contract.schemaId, name: 'Workflow message', definition: { type: 'object', properties: { text: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } }, required: ['text'], additionalProperties: false } })
  const add = (type: NodeType, title: string, description: string, index: number): WorkflowNode => {
    const node = createNode(type, { x: (index % 3) * 350, y: Math.floor(index / 3) * 250 })
    node.title = title; node.description = description
    if (node.type === 'agent') {
      node.config = { role: title, systemPrompt: `${description}\nОтделяй проверенные факты от предположений. Сохраняй источники. Не выдумывай отсутствующие данные.`, input: contract, output: contract, behavioralRules: ['При недостатке данных обозначь открытые вопросы.'], execution: { retries: 1, errorPolicy: 'Остановить шаг и запросить уточнение у человека.' } }
      node.notes = 'Перед реализацией выберите provider и model. Этот пример не вызывает AI.'
    } else if (node.type === 'trigger') node.config = { triggerType: 'manual', payload: contract, source: 'Запрос пользователя' }
    else if (node.type === 'artifact') node.config = { artifactType: 'document', format: 'Markdown', schema: contract, storageTarget: 'Локальный файл — путь уточняется при реализации' }
    project.nodes.push(node)
    return node
  }
  const rows: [NodeType, string, string][] = id === 'research' ? [
    ['trigger', 'Request', 'Поставить исследовательский вопрос и определить границы ответа.'],
    ['agent', 'Planner', 'Разбить вопрос на проверяемые подзадачи и критерии готовности.'],
    ['agent', 'Researcher', 'Собрать факты и источники по плану исследования.'],
    ['agent', 'Critic', 'Проверить источники, логические пробелы и противоречия.'],
    ['agent', 'Writer', 'Подготовить связный отчёт с выводами и открытыми вопросами.'],
  ] : id === 'content' ? [
    ['trigger', 'Brief', 'Определить аудиторию, тему, формат и ограничения материала.'],
    ['agent', 'Research', 'Собрать факты и ссылки, соответствующие брифу.'],
    ['agent', 'Copywriter', 'Создать черновик материала на основе проверенных фактов.'],
    ['agent', 'Editor', 'Проверить точность, структуру и тон материала.'],
    ['artifact', 'Artifact', 'Сохранить готовый Markdown-документ.'],
  ] : [
    ['concept', 'Webhook', 'Получить внешний запрос; формат и authentication определить позже.'],
    ['concept', 'Router', 'Выбрать сценарий обработки запроса.'],
    ['concept', 'Agent', 'Подготовить решение по запросу.'],
    ['concept', 'Human Approval', 'Человек проверяет и подтверждает предложенное действие.'],
    ['concept', 'API Tool', 'Передать подтверждённый результат внешней системе.'],
  ]
  const nodes = rows.map(([type, title, description], index) => add(type, title, description, index))
  for (let index = 1; index < nodes.length; index++) {
    const source = nodes[index - 1]!, target = nodes[index]!
    project.edges.push({ ...createEdge(source.id, target.id, source.ports[1]!.id, target.ports[0]!.id), label: id === 'automation' ? 'Следующий шаг' : 'Workflow message', contract: id === 'automation' ? { kind: 'informal', description: 'Формат передачи данных предстоит уточнить.' } : contract })
  }
  if (id === 'automation') project.schemas = []
  return project
}
