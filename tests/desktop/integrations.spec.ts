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
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createEdge, createId, createNode, createProject } from '../../src/domain/factories'
import { configureOperation } from '../../src/execution/configure-operation'
import { profileIds } from '../../src/profiles/schema'
import { integrationStateSchema } from '../../src/integrations/protocol'
import { jobSchema } from '../../src/runtime/job-schema'

test('Windows connector UI and packaged MCP execute only explicitly granted filesystem operations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wa-desktop-integrations-')), articles = await mkdtemp(join(tmpdir(), 'wa-desktop-articles-'))
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}), args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${directory}`], env })
  try {
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await expect(page.getByRole('button', { name: 'Пропустить настройку' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('ready')
    await page.getByRole('button', { name: 'Интеграции', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /Интеграции/ })
    await expect(dialog).toBeVisible()
    expect(errors).toEqual([])
    await dialog.getByLabel('Сервис', { exact: true }).selectOption('mcp-filesystem')
    await dialog.getByLabel('Название', { exact: true }).fill('Мои статьи · MCP')
    await dialog.getByLabel('Разрешённая папка', { exact: true }).fill(articles)
    await dialog.getByRole('button', { name: 'Создать подключение' }).click()
    await expect(dialog.getByText('Мои статьи · MCP', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Проверить', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'Разрешения инструментов' })).toBeVisible({ timeout: 20000 })
    await dialog.getByLabel('write_file', { exact: true }).check()
    await dialog.getByLabel('read_text_file', { exact: true }).check()
    await dialog.getByRole('button', { name: 'Сохранить разрешения' }).click()
    await expect.poll(async () => {
      const state = integrationStateSchema.parse(await page.evaluate(profileId => window.workflowDesktop!.runtime.request({ kind: 'integrations', command: { action: 'list', profileId } }), profileIds[0]))
      return state.connections[0]?.settings.kind === 'mcp-filesystem' ? state.connections[0].settings.tools.length : 0
    }).toBe(2)
    await page.screenshot({ path: 'output/verification-0.5.0/integrations-mcp.png' })
    const state = integrationStateSchema.parse(await page.evaluate(profileId => window.workflowDesktop!.runtime.request({ kind: 'integrations', command: { action: 'list', profileId } }), profileIds[0]))
    const connection = state.connections[0]!
    const project = createProject('MCP article'), trigger = configureOperation(createNode('trigger'), 'manual'), tool = configureOperation(createNode('tool'), 'connector')
    tool.operation = { kind: 'connector', connectionId: connection.id, action: 'mcp.call', fields: [
      { key: 'tool', source: { kind: 'literal', value: 'write_file' }, transform: 'identity' },
      { key: 'arguments', source: { kind: 'literal', value: { path: 'article.md', content: '# Статья\nПроверка настоящего MCP.' } }, transform: 'identity' },
    ] }
    project.nodes = [trigger, tool]; project.edges = [createEdge(trigger.id, tool.id, trigger.ports[1]!.id, tool.ports[0]!.id)]
    const id = createId()
    await page.evaluate(raw => window.workflowDesktop!.runtime.request({ kind: 'submit', request: JSON.parse(raw) as unknown }), JSON.stringify({ id, profileId: profileIds[0], eventKey: id, project, entryNodeId: trigger.id, input: {}, background: false }))
    await expect.poll(async () => jobSchema.parse(await page.evaluate(({ id, profileId }) => window.workflowDesktop!.runtime.request({ kind: 'get', profileId, id }), { id, profileId: profileIds[0] })).status, { timeout: 20000 }).toBe('succeeded')
    expect(await readFile(join(articles, 'article.md'), 'utf8')).toContain('настоящего MCP')
    await expect(page.evaluate(({ id, profileId }) => window.workflowDesktop!.runtime.request({ kind: 'integrations', command: { action: 'check', profileId, id } }), { id: connection.id, profileId: profileIds[1] })).rejects.toThrow('профилю')
    await expect(page.evaluate(() => window.workflowDesktop!.runtime.request({ kind: 'credential-resolve' }))).rejects.toThrow('Недопустимая')
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setSize(1024, 768) })
    await page.screenshot({ path: 'output/verification-0.5.0/integrations-compact.png' })
  } finally { await app.close() }
})
