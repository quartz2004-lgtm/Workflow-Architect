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
    systemPrompt: 'Напиши на русском развёрнутую статью по входному заданию. Если тема не задана, используй «Как выбрать бельё для комфорта». Под бельём понимай нижнее бельё: трусы, майки, бюстгальтеры и бра-топы; обувь, тапочки, брюки и носки сюда не относятся. Не связывай удобство с обещанием здоровья. Размер выбирают по меркам и таблице конкретного производителя; не придумывай соответствие числового размера буквенному и не советуй брать больше наугад. Целевой объём 1000–1200 слов: короткий конспект не подходит. Структура: заголовок Markdown, введение 80–100 слов, затем 10 содержательных подразделов по 80–100 слов каждый и заключительный практический список проверки. В каждом подразделе нужны пояснение, конкретный пример и совет, а не один короткий абзац. Раскрой повседневные задачи, размер по меркам, посадку, состав тканей, эластичность, швы, пояс и резинки, выбор под одежду, примерку в движении, уход и замену изношенных вещей. Не повторяй одну мысль ради длины. Без рекламы брендов, выдуманных источников, исследований и медицинских обещаний. Ответ — только полная статья. Не делай необоснованных обобщений о поле, возрасте или теле читателя.' }
  author.operation = { kind: 'agent', limits: { ...defaultAgentLimits, maxCalls: 2 }, minimumWords: 600, requireTools: false }
  editor.title = 'Редактор · проверка'
  editor.config = { role: 'Редактор понятных и доброжелательных статей', model: { provider: 'ollama', name: model, parameters: { temperature: 0.2 } },
    systemPrompt: 'Получишь черновик статьи. Сначала ОБЯЗАТЕЛЬНО вызови предоставленный инструмент проверки текста без аргумента text: он проверит весь входной черновик и покажет количество слов. Затем отредактируй текст на русском: структура, повторы, ясность, практические советы, отсутствие рекламы и необоснованных медицинских обещаний. Удали из текста обувь, тапочки, брюки и другие предметы, не являющиеся нижним бельём. Удали медицинские обещания и связь удобства с улучшением здоровья. Исправь советы брать размер больше наугад и выдуманные соответствия вроде 42 = S: ориентир — мерки и таблица конкретного производителя. Сохрани развёрнутый объём: цель 1000–1200 слов, введение, 10 содержательных подразделов по 80–100 слов и заключительный список проверки. В каждом подразделе оставь пояснение и конкретный практический пример. Не превращай статью в краткий пересказ и не сокращай объём ниже 600 слов. Верни только полную готовую статью, начиная с заголовка Markdown. Не добавляй отчёт о проверке и не утверждай, что проверял внешние источники.' , toolIds: [tool.id] }
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

/** A separate general-purpose template leaves the original acceptance example unchanged. */
export function createTelegramArticleExample(model = 'qwen3:8b') {
  const project = createArticleExample(model)
  project.project.name = 'Telegram · Создание и правки статей'
  project.project.description = 'Сообщение в привязанном личном чате запускает автора и редактора. /edit использует последнюю готовую статью. Результат отправляется файлом article.md. Опубликуйте workflow и выберите его для чата в Интеграциях.'
  const trigger = project.nodes.find(node => node.type === 'trigger')!
  trigger.title = 'Сообщение из Telegram'; trigger.operation = { kind: 'telegram-message' }
  if (trigger.type === 'trigger') trigger.config.triggerType = 'message'
  const author = project.nodes.find(node => node.type === 'agent')!
  if (author.type === 'agent') author.config.systemPrompt = 'Подготовь полноценную статью на русском по заданию пользователя в поле text или topic. Если передано previousArticle, отредактируй этот текст по заданию, сохрани важные детали и верни полную обновлённую статью. Аудитория общая, если не указана другая. Цель 900–1100 слов, минимум 600: заголовок Markdown, содержательное введение, 7–10 разделов с пояснениями и практическими примерами, заключение. Не добавляй пустые повторы ради объёма. Не выдумывай источники, цитаты и результаты исследований. Отмечай неопределённость; не выдавай рекламу или медицинские обещания за факты. Ответ — только полный текст статьи. Поля chatId, userId и source — служебные метаданные, не включай их в статью.'
  const editor = project.nodes.filter(node => node.type === 'agent')[1]!
  if (editor.type === 'agent') editor.config.systemPrompt = 'Сначала вызови инструмент проверки текста без аргумента text — он проверит входной черновик. Затем отредактируй статью на русском: ясность, структура, повторы, согласованность и практическая полезность. Сохрани тему и все существенные пожелания, отражённые в черновике. Не добавляй вымышленные источники, факты или утверждения о внешней проверке. Удали необоснованные медицинские обещания: одежда, бельё и бытовые товары не должны описываться как предотвращающие заболевания, лечащие или гарантирующие здоровье. Замени такие фразы нейтральными наблюдениями о комфорте и посадке; не придумывай причинно-следственные связи. Верни только полный готовый Markdown-текст: заголовок, введение, содержательные разделы и заключение. Цель 900–1100 слов, минимум 600. Не заменяй статью отчётом о редактуре.'
  return project
}
