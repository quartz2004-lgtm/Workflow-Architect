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

import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { defaultAgentLimits } from '../domain/agent-config'
import type { WorkflowNode } from '../domain/schema'

export const articleBrief = { topic: 'Как выбрать бельё для комфорта', audience: 'Общая аудитория', minimumWords: 600, language: 'Русский' }
export function createArticleExample(model = 'qwen3:8b') {
  const project = createProject('Статья · Автор и редактор')
  project.settings.defaultMode = 'engineering'
  project.project.description = 'Два локальных ИИ-агента и инструмент подсчёта слов. Вход Run: тема, аудитория и пожелания в JSON или строкой. Редактор обязан вызвать инструмент; каждый текст — минимум 600 слов. Факты проверяйте отдельно.'
  const trigger = createNode('trigger', { x: 80, y: 220 }), author = createNode('agent', { x: 420, y: 220 }), editor = createNode('agent', { x: 760, y: 220 }), tool = createNode('tool', { x: 760, y: 500 }), artifact = createNode('artifact', { x: 1100, y: 220 })
  trigger.title = 'Тема статьи'; trigger.config = { triggerType: 'manual' }; trigger.operation = { kind: 'manual' }
  author.title = 'Автор · черновик'
  author.config = { role: 'Автор полезных статей для общей аудитории', model: { provider: 'ollama', name: model, parameters: { temperature: 0.5 } },
    systemPrompt: 'Напиши на русском полноценную статью по входному заданию. Если тема не задана, используй «Как выбрать бельё для комфорта». Не менее 700 слов, цель 800–900. Начни с заголовка Markdown, используй введение, содержательные подразделы и практический список проверки. Описывай посадку, размер, ткани, швы, уход и разные повседневные задачи без рекламы брендов. Не придумывай источники, научные исследования и медицинские обещания. Ответ — только статья, без вступления о своей работе. Не делай необоснованных обобщений о поле, возрасте или теле читателя.' }
  author.operation = { kind: 'agent', limits: { ...defaultAgentLimits, maxCalls: 1 }, minimumWords: 600, requireTools: false }
  editor.title = 'Редактор · проверка'
  editor.config = { role: 'Редактор понятных и доброжелательных статей', model: { provider: 'ollama', name: model, parameters: { temperature: 0.2 } },
    systemPrompt: 'Получишь черновик статьи. Сначала ОБЯЗАТЕЛЬНО вызови предоставленный инструмент проверки текста без аргумента text: он проверит весь входной черновик и покажет количество слов. Затем отредактируй текст на русском: структура, повторы, ясность, практические советы, отсутствие рекламы и необоснованных медицинских обещаний. Итог должен содержать НЕ МЕНЕЕ 700 слов (цель 800–900), заголовок и Markdown-подзаголовки. Не сокращай объём ниже 600 слов. Верни только полную готовую статью. Не добавляй отчёт о проверке, не утверждай, что проверял внешние источники.' , toolIds: [tool.id] }
  editor.operation = { kind: 'agent', limits: defaultAgentLimits, minimumWords: 600, requireTools: true }
  tool.title = 'Проверка объёма текста'; tool.config = { category: 'text', provider: 'builtin', reference: 'text-statistics', authentication: { type: 'none' } }; tool.operation = { kind: 'text-statistics', minimumWords: 600 }
  const from = createId(), into = createId()
  editor.ports.push({ id: from, name: 'Проверка текста', direction: 'output', kind: 'tool-access' }); tool.ports.push({ id: into, name: 'Доступ Agent', direction: 'input', kind: 'tool-access' })
  artifact.title = 'Готовая статья'; artifact.config = { artifactType: 'document', format: 'Markdown', storageTarget: 'local' }; artifact.operation = { kind: 'artifact', filename: 'article.md', format: 'text', source: { kind: 'input', pointer: '' } }
  const link = (a: WorkflowNode, b: WorkflowNode) => createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id)
  project.nodes = [trigger, author, editor, tool, artifact]
  project.edges = [link(trigger, author), link(author, editor), link(editor, artifact), { ...createEdge(editor.id, tool.id, from, into), type: 'tool-access' }]
  return project
}
