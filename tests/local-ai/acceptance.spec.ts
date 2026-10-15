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

import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { profileIds } from '../../src/profiles/schema'
import { createArticleExample, createTelegramArticleExample, articleBrief } from '../../src/execution/article-example'
import { jobSchema } from '../../src/runtime/job-schema'
import { assistantTaskSchema, type AiCommand } from '../../src/ai/protocol'
import { countWords } from '../../src/ai/agent'
import { createEdge, createNode, createProject } from '../../src/domain/factories'
import { defaultAgentLimits } from '../../src/domain/agent-config'
import type { WorkflowNode } from '../../src/domain/schema'

const model = process.env.WORKFLOW_AI_MODEL ?? 'qwen3:8b'
const port = Number(process.env.WORKFLOW_AI_PORT ?? 11434)
const folder = resolve('output/ai-acceptance')
const command = (page: Page, command: AiCommand) => page.evaluate(command => window.workflowDesktop!.runtime.request({ kind: 'ai', command }), command)
async function generated(dialog: Locator, selector: string) {
  await expect(dialog.locator(`${selector}, .field-error`).first()).toBeVisible({ timeout: 180000 })
  expect(await dialog.locator('.field-error').allTextContents()).toEqual([])
}
async function launch() {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-real-ai-'))
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}), args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${directory}`], env })
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Пропустить настройку' }).click()
  await expect.poll(() => page.evaluate(() => window.workflowDesktop!.runtime.state())).toMatchObject({ status: 'ready' })
  await command(page, { action: 'save', profileId: profileIds[0], configuration: { provider: 'ollama', model, port }, enabled: true })
  await mkdir(folder, { recursive: true })
  return { app, page }
}
test('real Ollama executes the two-agent article workflow and preserves its trace', async () => {
  const { app, page } = await launch()
  try {
    const project = createArticleExample(model), id = randomUUID()
    const request = JSON.stringify({ id, eventKey: id, profileId: profileIds[0], project, entryNodeId: project.nodes[0]!.id, input: articleBrief, background: false })
    await page.evaluate(raw => window.workflowDesktop!.runtime.request({ kind: 'submit', request: JSON.parse(raw) as unknown }), request)
    await expect.poll(async () => {
      const raw = await page.evaluate(({ id, profileId }) => window.workflowDesktop!.runtime.request({ kind: 'get', id, profileId }), { id, profileId: profileIds[0] })
      const job = jobSchema.parse(raw)
      await writeFile(join(folder, 'article-run.json'), JSON.stringify(job, null, 2))
      return ['succeeded', 'failed', 'cancelled'].includes(job.status)
    }, { timeout: 310000, intervals: [1000, 2000] }).toBe(true)
    const job = jobSchema.parse(await page.evaluate(({ id, profileId }) => window.workflowDesktop!.runtime.request({ kind: 'get', id, profileId }), { id, profileId: profileIds[0] }))
    expect(job.status, job.outcome?.error?.message ?? job.message).toBe('succeeded')
    const article = job.outcome!.artifacts[0]!.content
    expect(countWords(article)).toBeGreaterThanOrEqual(600)
    expect(job.events.some(event => event.kind === 'ai' && event.trace.kind === 'tool-finish')).toBe(true)
    await writeFile(join(folder, 'article.md'), article)
    await writeFile(join(folder, 'article-project.json'), JSON.stringify(project, null, 2))
    await writeFile(join(folder, 'article-summary.json'), JSON.stringify({ model, words: countWords(article), status: job.status, usage: job.checkpoint?.aiUsage, durationMs: Date.parse(job.updatedAt) - Date.parse(job.createdAt) }, null, 2))
    await page.getByRole('button', { name: /^Run ·/ }).click()
    await expect(page.getByRole('region', { name: 'Локальное выполнение' })).toContainText('История')
    await page.screenshot({ path: join(folder, 'article-history.png') })
  } finally { await app.close() }
})

test('real Ollama creates and revises an article using the Telegram workflow input', async () => {
  test.setTimeout(660000)
  const { app, page } = await launch()
  try {
    const project = createTelegramArticleExample(model)
    const run = async (input: Record<string, string>, label: string) => {
      const id = randomUUID()
      const request = JSON.stringify({ id, eventKey: id, profileId: profileIds[0], project, entryNodeId: project.nodes[0]!.id, input, background: true })
      await page.evaluate(raw => window.workflowDesktop!.runtime.request({ kind: 'submit', request: JSON.parse(raw) as unknown }), request)
      const get = async () => jobSchema.parse(await page.evaluate(({ id, profileId }) => window.workflowDesktop!.runtime.request({ kind: 'get', id, profileId }), { id, profileId: profileIds[0] }))
      await expect.poll(async () => ['succeeded', 'failed', 'cancelled'].includes((await get()).status), { timeout: 310000, intervals: [2000] }).toBe(true)
      const job = await get()
      await writeFile(join(folder, `${label}-run.json`), JSON.stringify(job, null, 2))
      expect(job.status, job.outcome?.error?.message ?? job.message).toBe('succeeded')
      const article = job.outcome!.artifacts[0]!.content
      expect(countWords(article)).toBeGreaterThanOrEqual(600)
      expect(job.events.some(event => event.kind === 'ai' && event.trace.kind === 'tool-finish')).toBe(true)
      await writeFile(join(folder, `${label}.md`), article)
      return article
    }
    const article = await run({ text: 'Напиши статью «Как выбрать бельё для комфорта» для общей аудитории, от 600 слов.', source: 'telegram', chatId: '123456', userId: '123456' }, 'telegram-article')
    const revised = await run({ text: 'Добавь отдельный раздел с заголовком «Чек-лист примерки». В нём пять конкретных проверок в движении. Сохрани остальные полезные разделы и объём от 600 слов.', previousArticle: article, task: 'Отредактируй предыдущую статью. Верни полный обновлённый текст.', source: 'telegram', chatId: '123456', userId: '123456' }, 'telegram-revised')
    expect(revised).not.toBe(article)
    expect(revised.toLowerCase()).toContain('чек-лист примерки')
  } finally { await app.close() }
})

test('real Ollama passes capability probes and produces usable design and personalization', async () => {
  test.setTimeout(600000)
  const { app, page } = await launch()
  try {
    await page.getByRole('button', { name: 'ИИ-помощник', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /^ИИ ·/ })
    await dialog.getByRole('button', { name: 'Проверить модель и инструменты' }).click()
    await generated(dialog, '.ai-success')
    await page.screenshot({ path: join(folder, 'capabilities.png') })
    await dialog.getByRole('button', { name: '02 · Проектирование' }).click()
    await dialog.getByLabel(/Задача или уточнение/).fill('Создай последовательный workflow: ручной запрос темы, агент Автор пишет статью, агент Редактор проверяет черновик, артефакт сохраняет Markdown. Пока без инструментов и внешних API. Локальная модель. Все инструкции на русском.')
    await dialog.getByRole('button', { name: 'Предложить workflow' }).click()
    await generated(dialog, '.ai-proposal, .ai-question')
    if (await dialog.locator('.ai-question').count()) {
      await writeFile(join(folder, 'design-questions.txt'), await dialog.innerText())
      await dialog.getByLabel(/Задача или уточнение/).fill('Тема: Как выбрать бельё для комфорта. Общая аудитория. Русский язык, доброжелательный практический стиль. Минимум 600 слов, цель 1000 слов. Автор пишет развёрнутый черновик с введением, подразделами и примерами. Редактор улучшает ясность и структуру без сокращения объёма; без выдуманных источников и медицинских обещаний. Четыре узла: ручной Trigger → Agent Автор → Agent Редактор → Artifact Markdown. Других инструментов, API, дополнительных вопросов не требуется. Предложи этот граф сейчас.')
      await dialog.getByRole('button', { name: 'Отправить уточнение' }).click()
      await generated(dialog, '.ai-proposal, .ai-question')
    }
    await expect(dialog.getByRole('region', { name: 'Предварительный просмотр предложения' })).toBeVisible()
    await page.screenshot({ path: join(folder, 'design.png') })
    await dialog.getByRole('button', { name: 'Добавить на Canvas' }).click()
    await expect(dialog).toContainText('Добавлено · можно отменить Ctrl+Z')
    await dialog.getByRole('button', { name: '03 · Для меня' }).click()
    await dialog.getByLabel(/Пробная задача и ваши впечатления/).fill('Я создал автора и редактора статей, соединил узлы и запустил пример. Задача — русские статьи от 600 слов. Хочу сначала видеть основные настройки, крупнее отступы, минимальную анимацию. Технические параметры я пока понимаю плохо.')
    await dialog.getByRole('button', { name: 'Проанализировать и предложить варианты' }).click()
    await generated(dialog, '.ai-preset')
    expect(await dialog.locator('.ai-preset').count()).toBeGreaterThanOrEqual(2)
    expect(await dialog.locator('.ai-preset').count()).toBeLessThanOrEqual(3)
    await writeFile(join(folder, 'personalization-text.txt'), await dialog.innerText())
    await page.screenshot({ path: join(folder, 'personalization.png') })
    // Confirm the backend returned a schema-validated result without applying permissions.
    const other = await command(page, { action: 'state', profileId: profileIds[1] })
    expect(other).toEqual({ connection: null, problem: '' })
  } finally { await app.close() }
})

test('real Ollama cancellation closes an assistant request', async () => {
  const { app, page } = await launch()
  try {
    const task = assistantTaskSchema.parse(await command(page, { action: 'start', profileId: profileIds[0], input: { mode: 'design', graphSummary: '', conversation: [{ role: 'user', content: 'Подробно спроектируй процесс подготовки статей с автором и редактором.' }] } }))
    await expect.poll(async () => assistantTaskSchema.parse(await command(page, { action: 'get', profileId: profileIds[0], id: task.id })).trace.some(event => event.kind === 'model-start'), { timeout: 30000 }).toBe(true)
    const cancelled = assistantTaskSchema.parse(await command(page, { action: 'cancel', profileId: profileIds[0], id: task.id }))
    expect(cancelled.status).toBe('cancelled')
    await writeFile(join(folder, 'cancellation.json'), JSON.stringify(cancelled, null, 2))
  } finally { await app.close() }
})

test('real Ollama completes two concurrent agent branches and joins their results once', async () => {
  const { app, page } = await launch()
  try {
    const project = createProject('Real parallel acceptance'), trigger = createNode('trigger'), fork = createNode('logic'), joinNode = createNode('logic'), artifact = createNode('artifact')
    trigger.config = { triggerType: 'manual' }; trigger.operation = { kind: 'manual' }
    fork.config = { logicType: 'parallel' }; fork.operation = { kind: 'parallel', joinNodeId: joinNode.id, concurrency: 2 }
    joinNode.config = { logicType: 'merge' }; joinNode.operation = { kind: 'merge' }
    artifact.operation = { kind: 'artifact', filename: 'parallel.json', format: 'json', source: { kind: 'input', pointer: '' } }
    const agents = ['Ткани', 'Посадка'].map(title => {
      const agent = createNode('agent'); agent.title = title
      agent.config = { role: title, systemPrompt: `Назови два коротких совета о выборе белья: ${title}. Ответ на русском, не более 50 слов.`, model: { provider: 'ollama', name: model } }
      agent.operation = { kind: 'agent', limits: { ...defaultAgentLimits, maxCalls: 1, maxOutputTokens: 512 }, minimumWords: 5, requireTools: false }
      return agent
    })
    const link = (a: WorkflowNode, b: WorkflowNode) => createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id)
    project.nodes = [trigger, fork, ...agents, joinNode, artifact]
    project.edges = [link(trigger, fork), ...agents.flatMap(agent => [link(fork, agent), link(agent, joinNode)]), link(joinNode, artifact)]
    const id = randomUUID(), request = JSON.stringify({ id, eventKey: id, profileId: profileIds[0], project, entryNodeId: trigger.id, input: 'Комфорт каждый день', background: false })
    await page.evaluate(raw => window.workflowDesktop!.runtime.request({ kind: 'submit', request: JSON.parse(raw) as unknown }), request)
    const get = async () => jobSchema.parse(await page.evaluate(({ id, profileId }) => window.workflowDesktop!.runtime.request({ kind: 'get', id, profileId }), { id, profileId: profileIds[0] }))
    await expect.poll(async () => ['succeeded', 'failed', 'cancelled'].includes((await get()).status), { timeout: 180000 }).toBe(true)
    const job = await get()
    await writeFile(join(folder, 'parallel-run.json'), JSON.stringify(job, null, 2))
    expect(job.status, job.outcome?.error?.message ?? job.message).toBe('succeeded')
    const result = JSON.parse(job.outcome!.artifacts[0]!.content) as { results: { nodeId: string; output: string }[] }
    expect(result.results.map(item => item.nodeId)).toEqual(agents.map(agent => agent.id))
    expect(result.results.every(item => countWords(item.output) >= 5)).toBe(true)
    expect(job.events.filter(event => event.kind === 'step-start' && event.activation.nodeId === joinNode.id)).toHaveLength(1)
    const calls = job.events.filter(event => event.kind === 'ai' && ['model-start', 'model-finish'].includes(event.trace.kind))
    expect(calls.slice(0, 2).every(event => event.kind === 'ai' && event.trace.kind === 'model-start')).toBe(true)
  } finally { await app.close() }
})
