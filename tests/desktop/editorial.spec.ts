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
import { mkdtemp, mkdir, writeFile, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { profileIds } from '../../src/profiles/schema'

test('editorial starter, ordinary task, source preview and exact Human file in native UI', async () => {
  const firstDraft = `# Комфорт SOAR\n\n## Посадка\n${'Пример '.repeat(310)}`
  const addedParagraph = 'Проверка '.repeat(310).trim()
  const article = `${firstDraft}\n\n## Движение\n\n${addedParagraph}\n\n`
  const stages: string[] = []
  const prompts: string[] = []
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/tags') { response.end(JSON.stringify({ models: [{ name: 'editorial-fixture', digest: 'a'.repeat(64) }] })); return }
    if (request.url === '/api/show') { response.end(JSON.stringify({ capabilities: ['completion'], model_info: { 'llama.context_length': 32768 } })); return }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { messages: { content: string }[] }
    const system = body.messages[0]!.content
    const prompt = JSON.parse(body.messages[1]!.content)
    const stage = system.includes('Подготовь краткий') ? 'planner' : system.includes('Напиши полный') || system.includes('Подготовь живой') || prompt.baseVersionId ? 'writer' : 'reviewer'
    stages.push(stage)
    prompts.push(body.messages[1]!.content)
    // Exercise the real JSON revision wire contract before Human, including
    // restarting with the complete corrected version and no model available.
    const writerText = prompt.baseVersionId ? JSON.stringify({
      baseVersionId: prompt.baseVersionId,
      replacements: [], additions: [{ afterBlockId: 'p1', heading: { level: 2, title: 'Движение' }, paragraphs: [addedParagraph] }],
    }) : stages.length === 2 ? firstDraft : article
    const content = stage === 'planner' ? 'План: посадка и проверка в движении.' : stage === 'writer' ? prompt.task.kind === 'short-block' ? 'Выбор '.repeat(110) : writerText : '{"verdict":"ready-for-human","comments":[]}'
    response.end(JSON.stringify({ model: 'editorial-fixture', done: true, done_reason: 'stop', prompt_eval_count: 100, eval_count: 300, message: { role: 'assistant', content } }))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  const directory = await mkdtemp(join(tmpdir(), 'workflow-editorial-desktop-')), source = join(directory, 'source')
  await mkdir(join(source, 'source/current'), { recursive: true })
  await writeFile(join(source, 'source/current/CARE-v1.md'), '# Комфорт SOAR\nПроверяйте посадку белья в движении. Это тестовый источник, не реальные сведения о товарах.')
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const launch = () => electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}), args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${join(directory, 'profile')}`], env })
  let app = await launch()
  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('ready')
    await page.evaluate(({ profileId, port }) => window.workflowDesktop!.runtime.request({ kind: 'ai', command: { action: 'save', profileId, configuration: { provider: 'ollama', port, model: 'editorial-fixture' }, enabled: true } }), { profileId: profileIds[0], port })
    await page.getByRole('button', { name: 'ИИ-помощник', exact: true }).click()
    await page.getByRole('button', { name: '04 · Редакция и голос', exact: true }).click()
    const processPanel = page.getByRole('region', { name: 'Редакция и голос', exact: true })
    await expect(processPanel).toContainText('Версий пока нет')
    await processPanel.getByRole('button', { name: 'Сохранить новую версию', exact: true }).click()
    await processPanel.getByRole('button', { name: 'Использовать версию 1', exact: true }).click()
    await expect(processPanel).toContainText('Для новых редакционных задач: Моя редакция, версия 1.')
    await processPanel.getByRole('button', { name: 'Стандартная редакция', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть диалог', exact: true }).click()
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
    let panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
    await panel.getByLabel('Что подготовить?').fill('Комфорт SOAR: посадка белья в движении')
    await expect(panel.getByLabel('Вход запуска (JSON)', { exact: true })).toHaveCount(0)
    await panel.getByRole('button', { name: 'Посмотреть источники и фото для задания' }).click()
    await expect(panel.locator('.knowledge-context')).toContainText('CARE-v1.md')
    expect(stages).toEqual([])
    await panel.getByLabel('Разрешить этому запуску работать после закрытия окна').check()
    await panel.getByRole('button', { name: 'Запустить workflow', exact: true }).click()
    let human = panel.getByRole('region', { name: 'Ответ человеку' })
    await expect(human).toContainText('Вы подтверждаете версию 2', { timeout: 20000 })
    expect(await human.locator('pre').first().textContent()).toBe(article)
    expect(stages).toEqual(['planner', 'writer', 'reviewer', 'writer', 'reviewer'])
    await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))) })
    await page.screenshot({ path: 'desktop-results/editorial-human.png' })
    await human.getByText('Точная версия', { exact: true }).click()
    const identity = await human.locator('details pre').textContent()
    await app.close()
    await new Promise<void>(done => server.close(() => done()))
    // Only the synthetic source inside this test's mkdtemp directory is moved.
    expect(resolve(source)).toBe(join(resolve(directory), 'source'))
    await rename(source, join(directory, 'source-unavailable'))
    app = await launch(); page = await app.firstWindow()
    await page.getByRole('button', { name: /^Run ·/ }).click()
    panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
    human = panel.getByRole('region', { name: 'Ответ человеку' })
    await expect(human.getByRole('button', { name: 'Подтвердить', exact: true })).toBeEnabled()
    await human.getByText('Точная версия', { exact: true }).click()
    expect(await human.locator('details pre').textContent()).toBe(identity)
    expect(await human.locator('pre').first().textContent()).toBe(article)
    expect(stages).toEqual(['planner', 'writer', 'reviewer', 'writer', 'reviewer'])
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
    await new Promise<void>(done => server.listen(port, '127.0.0.1', done))
    await panel.getByRole('button', { name: 'Доработать этот текст' }).click()
    await expect(panel.getByRole('region', { name: 'Текст для доработки' })).toContainText('Прежнее одобрение не переносится')
    await panel.getByLabel('Что подготовить?').fill('Добавь полезный вывод, сохрани остальные разделы')
    await panel.getByRole('button', { name: 'Запустить workflow', exact: true }).click()
    await expect(human).toContainText('Вы подтверждаете версию 1', { timeout: 20000 })
    expect(JSON.parse(prompts[5]!).task.previousArticle).toBe(article)
    expect(stages).toHaveLength(8)
    await expect(panel.locator('.run-artifact')).toHaveCount(0)
    await human.getByRole('button', { name: 'Отклонить', exact: true }).click()
    await expect(panel.getByRole('region', { name: 'Редакционный процесс' })).toContainText('Вы отклонили эту версию')
    await expect(panel.locator('.run-artifact')).toHaveCount(0)
    await panel.getByRole('button', { name: 'Новое задание', exact: true }).click()
    await panel.getByLabel('Тип результата').selectOption('revision')
    await panel.getByLabel('Что подготовить?').fill('Комфорт SOAR: короткий совет о посадке')
    await panel.getByRole('button', { name: 'Запустить workflow', exact: true }).click()
    await expect(panel.getByRole('alert')).toContainText('Вставьте исходный текст')
    expect(stages).toHaveLength(8)
    await panel.getByLabel('Тип результата').selectOption('content-plan')
    await panel.getByLabel('Количество пунктов').fill('7')
    await expect(panel.getByLabel('Количество пунктов')).toHaveValue('7')
    await panel.getByLabel('Тип результата').selectOption('short-block')
    await expect(panel.getByLabel('Минимальный объём, слов')).toHaveCount(0)
    await panel.getByLabel('Тип результата').scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'desktop-results/editorial-result-type.png' })
    await panel.getByRole('button', { name: 'Запустить workflow', exact: true }).click()
    await expect(human).toContainText('Вы подтверждаете версию 1', { timeout: 20000 })
    expect(JSON.parse(prompts[8]!).task).toMatchObject({ schemaVersion: '0.5.5', kind: 'short-block', minimumWords: 100, maximumWords: 130 })
    expect(await human.locator('pre').first().textContent()).toBe('Выбор '.repeat(110))
    await expect(panel.getByRole('region', { name: 'Редакционный процесс' })).toContainText('максимум 130')
    await human.getByRole('button', { name: 'Подтвердить', exact: true }).click()
    await expect(panel.locator('.run-artifact')).toContainText('article.md')
    const callsBeforeBatch = stages.length
    await panel.getByText('Очередь нескольких статей', { exact: true }).click()
    let batch = panel.getByRole('region', { name: 'Очередь материалов', exact: true })
    for (let i = 0; i < 10; i++) {
      if (i) await batch.getByRole('button', { name: 'Добавить материал', exact: true }).click()
      await batch.getByLabel(`Материал ${i + 1}`, { exact: true }).fill(`Комфорт SOAR: материал ${i + 1}, посадка в движении`)
    }
    await expect(batch.getByRole('button', { name: 'Добавить материал', exact: true })).toBeDisabled()
    await batch.getByLabel('Разрешить всей очереди работать после закрытия окна').check()
    await batch.getByRole('button', { name: 'Поставить в очередь · 10', exact: true }).click()
    await expect(batch.getByRole('button', { name: 'Открыть материал', exact: true })).toHaveCount(10).catch(async error => {
      await page.screenshot({ path: 'desktop-results/editorial-batch-failure.png' })
      throw new Error(`${String(error)}\n${await batch.innerText()}`)
    })
    await batch.getByRole('button', { name: 'Открыть материал', exact: true }).first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'desktop-results/editorial-batch.png' })
    for (let i = 0; i < 10; i++) {
      if (i === 5) {
        await expect.poll(() => page.evaluate(async profileId => (await window.workflowDesktop!.runtime.request({ kind: 'list', profileId }) as { status: string }[]).filter(job => job.status === 'running').length, profileIds[0])).toBe(0)
        await app.close(); app = await launch(); page = await app.firstWindow()
        await page.getByRole('button', { name: /^Run ·/ }).click()
        panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
        human = panel.getByRole('region', { name: 'Ответ человеку' })
        await panel.getByText('Очередь нескольких статей', { exact: true }).click()
        batch = panel.getByRole('region', { name: 'Очередь материалов', exact: true })
        await expect(batch.getByRole('button', { name: 'Открыть материал', exact: true })).toHaveCount(10)
      }
      await batch.getByRole('button', { name: 'Открыть материал', exact: true }).nth(i).click()
      await expect(human).toContainText('Вы подтверждаете версию 1', { timeout: 20000 })
      await human.getByRole('button', { name: 'Подтвердить', exact: true }).click()
      await expect(panel.locator('.run-artifact')).toContainText('article.md')
    }
    expect(stages.length - callsBeforeBatch).toBe(30)
    const batches = await page.evaluate(profileId => window.workflowDesktop!.runtime.request({ kind: 'editorial-batch', command: { action: 'list', profileId } }), profileIds[0]) as { items: { id: string }[] }[]
    expect(batches).toHaveLength(1)
    const jobs = await page.evaluate(async ({ profileId, ids }) => Promise.all(ids.map(id => window.workflowDesktop!.runtime.request({ kind: 'get', profileId, id }))), { profileId: profileIds[0], ids: batches[0]!.items.map(item => item.id) }) as { id: string; status: string; preparedKnowledge: { packet: { runId: string } }[] }[]
    expect(jobs.every(job => job.status === 'succeeded' && job.preparedKnowledge.every(entry => entry.packet.runId === job.id))).toBe(true)
    expect(new Set(jobs.map(job => job.id)).size).toBe(10)
    expect(await page.evaluate(profileId => window.workflowDesktop!.runtime.request({ kind: 'editorial-batch', command: { action: 'list', profileId } }), profileIds[1])).toEqual([])
  } finally { await app.close(); await new Promise<void>(done => server.close(() => done())) }
})
