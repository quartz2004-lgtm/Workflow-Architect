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
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { profileIds } from '../../src/profiles/schema'

test('editorial starter, ordinary task, source preview and exact Human file in native UI', async () => {
  const article = `# Комфорт SOAR\n\n## Посадка\n${'Пример '.repeat(310)}\n\n## Движение\n${'Проверка '.repeat(310)}`
  const stages: string[] = []
  const prompts: string[] = []
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/tags') { response.end(JSON.stringify({ models: [{ name: 'editorial-fixture', digest: 'a'.repeat(64) }] })); return }
    if (request.url === '/api/show') { response.end(JSON.stringify({ capabilities: ['completion'], model_info: { 'llama.context_length': 32768 } })); return }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { messages: { content: string }[] }
    const system = body.messages[0]!.content
    const stage = system.includes('Подготовь краткий') ? 'planner' : system.includes('Напиши полный') ? 'writer' : 'reviewer'
    stages.push(stage)
    prompts.push(body.messages[1]!.content)
    const content = stage === 'planner' ? 'План: посадка и проверка в движении.' : stage === 'writer' ? article : '{"verdict":"ready-for-human","comments":[]}'
    response.end(JSON.stringify({ model: 'editorial-fixture', done: true, done_reason: 'stop', prompt_eval_count: 100, eval_count: 300, message: { role: 'assistant', content } }))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  const directory = await mkdtemp(join(tmpdir(), 'workflow-editorial-desktop-')), source = join(directory, 'source')
  await mkdir(join(source, 'source/current'), { recursive: true })
  await writeFile(join(source, 'source/current/CARE-v1.md'), '# Комфорт SOAR\nПроверяйте посадку белья в движении. Это тестовый источник, не реальные сведения о товарах.')
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}), args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${join(directory, 'profile')}`], env })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('ready')
    await page.evaluate(({ profileId, port }) => window.workflowDesktop!.runtime.request({ kind: 'ai', command: { action: 'save', profileId, configuration: { provider: 'ollama', port, model: 'editorial-fixture' }, enabled: true } }), { profileId: profileIds[0], port })
    await page.getByRole('button', { name: 'Знания SOAR', exact: true }).click()
    const knowledge = page.getByRole('dialog', { name: 'Знания SOAR' })
    await knowledge.getByRole('button', { name: 'Подключить папку', exact: true }).click()
    await knowledge.getByLabel('Папка источника', { exact: true }).fill(source)
    await knowledge.getByRole('button', { name: 'Прочитать список файлов' }).click()
    await expect(knowledge).toContainText('Доступно 1 · выбрано 1')
    await knowledge.getByRole('button', { name: 'Подготовить снимок' }).click()
    await knowledge.getByLabel(/Я проверил выбор/).check()
    await knowledge.getByRole('button', { name: 'Сохранить этот снимок' }).click()
    await expect(knowledge.getByRole('article')).toContainText('Доступ разрешён')
    await knowledge.getByRole('button', { name: 'Закрыть диалог', exact: true }).click()
    await page.getByRole('button', { name: 'Открыть проекты', exact: true }).click()
    await page.getByRole('button', { name: 'Подготовить редакционный сценарий' }).click()
    await page.getByRole('button', { name: 'Создать и открыть редакцию' }).click()
    await expect(page.getByRole('dialog', { name: 'Локальные проекты' })).toHaveCount(0)
    await page.getByRole('button', { name: /^Run ·/ }).click()
    const panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
    await panel.getByLabel('Что подготовить?').fill('Комфорт SOAR: посадка белья в движении')
    await expect(panel.getByLabel('Вход запуска (JSON)', { exact: true })).toHaveCount(0)
    await panel.getByRole('button', { name: 'Посмотреть источники и фото для задания' }).click()
    await expect(panel.locator('.knowledge-context')).toContainText('CARE-v1.md')
    expect(stages).toEqual([])
    await panel.getByRole('button', { name: 'Запустить workflow', exact: true }).click()
    const human = panel.getByRole('region', { name: 'Ответ человеку' })
    await expect(human).toContainText('Вы подтверждаете версию 1', { timeout: 20000 })
    expect(await human.locator('pre').first().textContent()).toBe(article)
    expect(stages).toEqual(['planner', 'writer', 'reviewer'])
    await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))) })
    await page.screenshot({ path: 'desktop-results/editorial-human.png' })
    await human.getByRole('button', { name: 'Подтвердить', exact: true }).click()
    const artifact = panel.locator('.run-artifact')
    await expect(artifact).toContainText('article.md')
    await expect(panel.getByRole('region', { name: 'Редакционный процесс' })).toContainText('Вы подтвердили эту версию')
    await artifact.locator('summary').click()
    expect(await artifact.locator('pre').textContent()).toBe(article)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1000, 700))
    await artifact.scrollIntoViewIfNeeded()
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: 'desktop-results/editorial-compact.png' })
    await panel.getByRole('button', { name: 'Доработать этот текст' }).click()
    await expect(panel.getByRole('region', { name: 'Текст для доработки' })).toContainText('Прежнее одобрение не переносится')
    await panel.getByLabel('Что подготовить?').fill('Добавь полезный вывод, сохрани остальные разделы')
    await panel.getByRole('button', { name: 'Запустить workflow', exact: true }).click()
    await expect(human).toContainText('Вы подтверждаете версию 1', { timeout: 20000 })
    expect(JSON.parse(prompts[3]!).task.previousArticle).toBe(article)
    expect(stages).toHaveLength(6)
    await expect(panel.locator('.run-artifact')).toHaveCount(0)
    await human.getByRole('button', { name: 'Отклонить', exact: true }).click()
    await expect(panel.getByRole('region', { name: 'Редакционный процесс' })).toContainText('Вы отклонили эту версию')
    await expect(panel.locator('.run-artifact')).toHaveCount(0)
  } finally { await app.close(); await new Promise<void>(done => server.close(() => done())) }
})
