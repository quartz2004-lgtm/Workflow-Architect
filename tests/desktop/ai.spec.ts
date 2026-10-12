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

import { _electron as electron, expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('local AI connection, reviewed graph proposal, undo and profile recommendations', async () => {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) as { model: string; messages: { role: string; content: string }[]; tools?: { function: { name: string } }[]; format?: unknown } : null
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/tags') { response.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }] })); return }
    if (request.url === '/api/show') { response.end(JSON.stringify({ capabilities: ['completion', 'tools', 'thinking'], model_info: { 'qwen3.context_length': 40960 } })); return }
    const system = body?.messages[0]?.content ?? ''
    let content = 'OK', tool_calls: { function: { name: string; arguments: object } }[] = []
    if (system.includes('помощник проектирования')) content = JSON.stringify({ message: 'Предлагаю автора и проверку текста.', questions: [],
      nodes: [{ key: 0, type: 'trigger', title: 'Тема-ИИ', description: 'Ручной запрос', role: '', systemPrompt: '' }, { key: 1, type: 'agent', title: 'Автор-ИИ', description: 'Подготовить статью', role: 'Автор', systemPrompt: 'Пиши на русском' }, { key: 2, type: 'tool', title: 'Проверка-ИИ', description: 'Количество слов', role: '', systemPrompt: '' }, { key: 3, type: 'artifact', title: 'Файл-ИИ', description: 'Markdown', role: '', systemPrompt: '' }],
      edges: [{ source: 0, target: 1, type: 'flow' }, { source: 1, target: 2, type: 'tool-access' }, { source: 1, target: 3, type: 'flow' }] })
    else if (system.includes('помощник настройки')) content = JSON.stringify({ analysis: 'Вы попробовали связать узлы; предлагаю два варианта.', options: [
      { title: 'Компактная работа', explanation: 'Больше места для графа.', preferences: { detail: 'technical', density: 'compact', motion: 'reduced', defaultMode: 'engineering', favoriteTemplates: ['content'] } },
      { title: 'Пошаговый старт', explanation: 'Основные поля видны первыми.', preferences: { detail: 'guided', density: 'comfortable', motion: 'system', defaultMode: 'concept', favoriteTemplates: [] } },
    ] })
    else if (body?.tools?.length && body.messages.at(-1)?.role !== 'tool') { content = ''; tool_calls = [{ function: { name: body.tools[0]!.function.name, arguments: {} } }] }
    else if (body?.format) content = '{"ok":true}'
    response.end(JSON.stringify({ model: 'qwen3:8b', done: true, done_reason: 'stop', prompt_eval_count: 50, eval_count: 100, message: { role: 'assistant', content, tool_calls } }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const directory = await mkdtemp(join(tmpdir(), 'workflow-ai-desktop-'))
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}), args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${directory}`], env })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await page.getByRole('button', { name: 'ИИ-помощник', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /^ИИ ·/ })
    await expect(dialog.getByLabel(/Порт Ollama/)).toBeEnabled()
    await dialog.getByLabel(/Порт Ollama/).fill(String(port))
    await dialog.getByRole('button', { name: 'Найти модели' }).click()
    await expect(dialog).toContainText('Найдено моделей: 1')
    await dialog.getByRole('checkbox', { name: /Разрешить локальную модель/ }).check()
    await dialog.getByRole('button', { name: 'Сохранить подключение' }).click()
    await dialog.getByRole('button', { name: 'Проверить модель и инструменты' }).click()
    await expect(dialog).toContainText('Модель ответила, вызвала тестовый инструмент', { timeout: 15000 })
    await page.screenshot({ path: 'desktop-results/ai-connection.png' })
    await dialog.getByRole('button', { name: '02 · Проектирование' }).click()
    await dialog.getByLabel(/Задача или уточнение/).fill('Нужен автор статей с инструментом проверки слов и готовым файлом.')
    await dialog.getByRole('button', { name: 'Предложить workflow' }).click()
    await expect(dialog.getByRole('region', { name: 'Предварительный просмотр предложения' })).toBeVisible()
    await expect(dialog.getByRole('checkbox', { name: /Разрешить новым агентам/ })).not.toBeChecked()
    await dialog.getByRole('checkbox', { name: /Разрешить новым агентам/ }).check()
    await page.screenshot({ path: 'desktop-results/ai-proposal.png' })
    await dialog.getByRole('button', { name: 'Добавить на Canvas' }).click()
    await expect(dialog).toContainText('Добавлено · можно отменить Ctrl+Z')
    await dialog.getByRole('button', { name: 'Закрыть диалог', exact: true }).click()
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Автор-ИИ' })).toBeVisible()
    await page.getByRole('button', { name: 'Отменить', exact: true }).click()
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Автор-ИИ' })).toHaveCount(0)
    const density = await page.locator('.app-shell').getAttribute('data-density')
    await page.getByRole('button', { name: 'ИИ-помощник', exact: true }).click()
    await dialog.getByRole('button', { name: '03 · Для меня' }).click()
    await dialog.getByLabel(/Пробная задача и ваши впечатления/).fill('Соединил автора и инструмент. Хочу больше места для графа и меньше движения.')
    await dialog.getByRole('button', { name: 'Проанализировать и предложить варианты' }).click()
    await expect(dialog.getByRole('heading', { name: 'Компактная работа' })).toBeVisible()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-density', density!)
    await dialog.getByRole('button', { name: 'Выбрать этот вариант' }).first().click()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-density', density!)
    await dialog.getByRole('button', { name: 'Применить настройки', exact: true }).click()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-density', 'compact')
    await page.screenshot({ path: 'desktop-results/ai-personalization.png' })
    await dialog.getByRole('button', { name: 'Вернуть настройки до ИИ' }).click()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-density', density!)
  } finally { await app.close(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
