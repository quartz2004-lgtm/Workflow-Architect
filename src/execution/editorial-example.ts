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

import { createEdge, createNode, createProject } from '../domain/factories'
import { defaultAgentLimits } from '../domain/agent-config'
import { defaultEditorialBudget } from '../domain/editorial-config'
import { defaultAgentKnowledge, type AgentKnowledge } from '../domain/knowledge-config'

/** Two entries converge on one identical, published editorial contract. */
export function createEditorialExample(model: string, knowledge: AgentKnowledge = defaultAgentKnowledge) {
  const project = createProject('Локальная редакция · SOAR')
  project.settings.defaultMode = 'engineering'
  project.project.description = 'Задание с ПК или из Telegram → досье → план → текст → проверка → ваше подтверждение → файл. До запуска выберите базу знаний.'
  const manual = createNode('trigger', { x: 80, y: 100 }), telegram = createNode('trigger', { x: 80, y: 380 })
  const agent = createNode('agent', { x: 420, y: 220 }), human = createNode('human', { x: 760, y: 220 }), artifact = createNode('artifact', { x: 1100, y: 220 })
  manual.title = 'Задание с компьютера'; manual.config = { triggerType: 'manual' }; manual.operation = { kind: 'manual' }
  telegram.title = 'Сообщение Telegram'; telegram.config = { triggerType: 'message' }; telegram.operation = { kind: 'telegram-message' }
  agent.title = 'Редакция · план, текст, проверка'
  agent.config = { role: 'Редакционная команда SOAR', model: { provider: 'ollama', name: model, parameters: { temperature: 0.3 } }, systemPrompt: 'Пиши на русском для указанной аудитории. Сохраняй проверяемые факты и условия из досье SOAR. Улучшай подачу свободно, избегай штампов и повторов. При правках сохраняй остальную полезную часть исходного текста. Не обещай свойства товара, которых нет в источниках.' }
  agent.operation = { kind: 'agent', limits: { ...defaultAgentLimits, timeoutMs: 300000, contextTokens: 32768, maxOutputTokens: 4096 }, minimumWords: 600, requireTools: false, knowledge: structuredClone(knowledge), editorial: { ...defaultEditorialBudget } }
  human.title = 'Проверить и подтвердить версию'; human.config = { interactionType: 'approval' }
  human.operation = { kind: 'human', mode: 'approval', question: 'Прочитайте конкретную версию текста. Подтвердить её и сохранить готовый файл?', timeoutMs: 1800000 }
  artifact.title = 'Подтверждённая статья'; artifact.config = { artifactType: 'document', format: 'Markdown', storageTarget: 'local' }
  artifact.operation = { kind: 'artifact', filename: 'article.md', format: 'text', source: { kind: 'input', pointer: '/version/text' } }
  const link = (from: typeof manual | typeof agent | typeof human, to: typeof agent | typeof human | typeof artifact) => createEdge(from.id, to.id, from.ports[1]!.id, to.ports[0]!.id)
  project.nodes = [manual, telegram, agent, human, artifact]
  project.edges = [link(manual, agent), link(telegram, agent), link(agent, human), link(human, artifact)]
  return project
}
