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
import { mkdtemp, mkdir, writeFile, rename, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { profileIds } from '../../src/profiles/schema'
import { createNode, createProject } from '../../src/domain/factories'
import { defaultAgentLimits } from '../../src/domain/agent-config'

test('knowledge wizard: exact preview, update, backup, isolated restore and restart without source or network', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-knowledge-desktop-')), source = join(directory, 'soar'), backup = join(directory, 'backup.json')
  await mkdir(join(source, 'source/current'), { recursive: true })
  await writeFile(join(source, 'KNOWLEDGE-VERSION.json'), '{"version":"acceptance-v1"}')
  await writeFile(join(source, 'source/current/CARE-v1.md'), '# Care\nSynthetic local knowledge.')
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const launch = () => electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}), args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${join(directory, 'profile')}`], env })
  let app = await launch()
  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await page.getByRole('button', { name: 'Знания SOAR', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: 'Знания SOAR' })
    await expect(dialog).toContainText('Знания агента')
    await dialog.getByRole('button', { name: 'Подключить папку', exact: true }).click()
    await dialog.getByLabel('Папка источника', { exact: true }).fill(source)
    await dialog.getByRole('button', { name: 'Прочитать список файлов' }).click()
    await expect(dialog.getByText(/Доступно 2 · выбрано 2/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Подготовить снимок' }).click()
    const save = dialog.getByRole('button', { name: 'Сохранить этот снимок' })
    await expect(save).toBeDisabled()
    await dialog.getByLabel(/Я проверил выбор/).check()
    await save.click()
    const article = dialog.getByRole('article')
    await expect(article).toContainText('acceptance-v1')
    await article.getByRole('button', { name: /source\/current\/CARE-v1.md/ }).click()
    await expect(dialog.getByRole('region', { name: 'Просмотр документа' })).toContainText('Synthetic local knowledge.')
    await dialog.getByRole('button', { name: 'Закрыть документ' }).click()
    await dialog.getByRole('button', { name: 'Закрыть диалог' }).click()
    const project = createProject('Knowledge inspector'), agent = createNode('agent')
    agent.title = 'Source reader'; agent.operation = { kind: 'agent', limits: defaultAgentLimits, minimumWords: 0, requireTools: false }
    project.nodes.push(agent)
    await page.getByRole('button', { name: 'Открыть проекты' }).click()
    const projects = page.getByRole('dialog', { name: 'Локальные проекты' })
    await projects.getByLabel('Файл проекта').setInputFiles({ name: 'knowledge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
    await projects.getByRole('button', { name: 'Открыть импорт' }).click()
    await page.locator('.react-flow__node').filter({ hasText: 'Source reader' }).click()
    await page.locator('.knowledge-fields > summary').click()
    await page.getByRole('button', { name: 'Выбрать коллекции' }).click()
    await page.locator('.knowledge-fields input[type=checkbox]').first().check()
    await page.getByLabel('Поисковый запрос', { exact: true }).fill('Care')
    await page.getByLabel('Поисковый запрос', { exact: true }).press('Tab')
    await page.getByRole('button', { name: 'Проверить источники без запуска ИИ' }).click()
    await expect(page.locator('.knowledge-context')).toContainText('Выдержки: 1')
    await page.locator('.knowledge-context > details > summary').click()
    await expect(page.locator('.knowledge-context')).toContainText('Synthetic local knowledge.')
    await page.locator('.knowledge-context > details > pre').scrollIntoViewIfNeeded()
    await page.mouse.move(500, 100)
    await expect(page.locator('.field-help-panel')).toHaveCount(0)
    await page.screenshot({ path: 'desktop-results/knowledge-inspector-context.png' })
    expect(await page.locator('.knowledge-fields').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.getByRole('button', { name: 'Знания SOAR', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Знания SOAR' })
    await page.screenshot({ path: 'desktop-results/knowledge-desktop.png' })
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setSize(1000, 700) })
    await page.screenshot({ path: 'desktop-results/knowledge-compact.png' })
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await writeFile(join(source, 'source/current/CARE-v1.md'), '# Care\nUpdated evidence.')
    await article.getByRole('button', { name: 'Обновить снимок' }).click()
    await dialog.getByRole('button', { name: 'Прочитать список файлов' }).click()
    await dialog.getByRole('button', { name: 'Подготовить снимок' }).click()
    await expect(dialog).toContainText('Добавлено 0 · изменено 1 · удалено 0')
    await dialog.getByLabel(/Я проверил выбор/).check(); await save.click()
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, backup)
    await article.getByRole('button', { name: 'Сохранить копию…' }).click()
    await expect(dialog).toContainText('Резервная копия сохранена')
    expect(await readFile(backup, 'utf8')).not.toContain(source.replaceAll('\\', '\\\\'))
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, backup)
    expect(await page.evaluate(profileId => window.workflowDesktop!.knowledge!.request({ kind: 'restore', profileId }), profileIds[1])).toMatchObject({ ok: true })
    const other = await page.evaluate(profileId => window.workflowDesktop!.knowledge!.request({ kind: 'list', profileId }), profileIds[1]) as { value: { collections: { id: string }[] } }
    expect(other.value.collections).toHaveLength(1)
    expect(await page.evaluate(({ profileId, id }) => window.workflowDesktop!.knowledge!.request({ kind: 'backup', profileId, id }), { profileId: profileIds[0], id: other.value.collections[0]!.id })).toMatchObject({ ok: false })
    await dialog.getByRole('button', { name: 'Закрыть диалог' }).click()
    await app.close(); await rename(source, `${source}-offline`)
    app = await launch(); page = await app.firstWindow(); await page.context().setOffline(true)
    await page.getByRole('button', { name: 'Знания SOAR', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Знания SOAR' })
    await expect(dialog.getByRole('article')).toHaveCount(1)
    await expect(dialog).toContainText('Источник недоступен')
    await dialog.getByRole('button', { name: /source\/current\/CARE-v1.md/ }).first().click()
    await expect(dialog.getByRole('region', { name: 'Просмотр документа' })).toContainText('Updated evidence.')
  } finally { await app.close() }
})
