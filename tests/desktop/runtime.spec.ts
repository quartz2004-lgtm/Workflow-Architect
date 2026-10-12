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

import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createExecutionExample } from '../../src/execution/example'
import { createEdge, createId, createNode, createProject } from '../../src/domain/factories'
import { configureOperation } from '../../src/execution/configure-operation'
import { jobSchema, type RuntimeJob } from '../../src/runtime/job-schema'
import { profileIds } from '../../src/profiles/schema'

const owner = profileIds[0]
async function launch(existing?: string) {
  const directory = existing ?? await mkdtemp(join(tmpdir(), 'workflow-service-test-'))
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}),
    args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${directory}`], env })
  const page = await app.firstWindow()
  await expect(page.getByRole('application').or(page.getByRole('button', { name: 'Пропустить настройку' }))).toBeVisible({ timeout: 15000 })
  if (await page.getByRole('button', { name: 'Пропустить настройку' }).isVisible()) await page.getByRole('button', { name: 'Пропустить настройку' }).click()
  await expect(page.getByRole('application')).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('ready')
  return { app, page, directory }
}
async function get(page: Page, id: string): Promise<RuntimeJob> {
  return jobSchema.parse(await page.evaluate(({ id, owner }) => window.workflowDesktop!.runtime.request({ kind: 'get', profileId: owner, id }), { id, owner }))
}
async function submit(page: Page, project = createExecutionExample(), background = true) {
  const id = createId()
  const raw = JSON.stringify({
    id, profileId: owner, eventKey: id, project, entryNodeId: project.nodes[0]!.id, input: { approved: true, text: 'service' }, background,
  })
  return jobSchema.parse(await page.evaluate(raw => window.workflowDesktop!.runtime.request({ kind: 'submit', request: JSON.parse(raw) as unknown }), raw))
}

test('utility process survives editor close and completes an allowed run without a window', async () => {
  const { app, page, directory } = await launch()
  try {
    const project = createProject('Background execution')
    project.nodes = [configureOperation(createNode('trigger'), 'manual'), ...Array.from({ length: 80 }, () => {
      const node = configureOperation(createNode('data'), 'map')
      node.operation = { kind: 'map', keepInput: true, fields: [] }
      return node
    }), configureOperation(createNode('artifact'), 'artifact')]
    project.edges = project.nodes.slice(1).map((target, index) => createEdge(project.nodes[index]!.id, target.id, project.nodes[index]!.ports[1]!.id, target.ports[0]!.id))
    const background = await submit(page, project)
    const foreground = await submit(page, createExecutionExample(), false)
    await expect.poll(async () => (await get(page, foreground.id)).status).toBe('waiting')
    const closed = page.waitForEvent('close')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close())
    await closed
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0)
    const read = async (id: string) => jobSchema.parse(JSON.parse(await readFile(join(directory, 'runtime', 'jobs', `${id}.json`), 'utf8')))
    expect((await read(foreground.id)).status).toBe('cancelled')
    expect((await read(background.id)).status).not.toBe('succeeded')
    await expect.poll(async () => {
      const saved = await read(background.id)
      return { status: saved.status, message: saved.message, error: saved.outcome?.error?.message ?? '' }
    }, { timeout: 20000 }).toMatchObject({ status: 'succeeded' })
    expect((await read(background.id)).outcome!.artifacts).toHaveLength(1)
    expect(await app.evaluate(({ app }) => app.getAppMetrics().some(metric => metric.name === 'Workflow Architect Runtime'))).toBe(true)
    const reopened = app.waitForEvent('window')
    await app.evaluate(({ app }) => { app.emit('second-instance', {}, [], process.cwd()) })
    const next = await reopened
    await expect(next.getByRole('application')).toBeVisible()
    expect((await get(next, background.id)).status).toBe('succeeded')
  } finally { await app.close() }
})

test('killed utility process reconnects to the same checkpoint and rejects unsafe IPC commands', async () => {
  const { app, page } = await launch()
  try {
    const job = await submit(page)
    await expect.poll(async () => (await get(page, job.id)).status).toBe('waiting')
    const before = await get(page, job.id), request = before.checkpoint!.frames.at(-1)!.human!.request
    await expect(page.evaluate(() => window.workflowDesktop!.runtime.request({ kind: 'stop' }))).rejects.toThrow('Недопустимая')
    await expect(page.evaluate(() => window.workflowDesktop!.runtime.request({ kind: 'get', profileId: 'invalid', id: 'invalid' }))).rejects.toThrow()
    const extraWindow = app.waitForEvent('window')
    await app.evaluate(({ app, BrowserWindow }) => {
      const untrusted = new BrowserWindow({ show: false, webPreferences: { preload: `${app.getAppPath()}/desktop-dist/preload.cjs`, sandbox: true, contextIsolation: true, nodeIntegration: false } })
      void untrusted.loadURL('workflow://app/index.html')
    })
    const untrusted = await extraWindow
    await untrusted.waitForLoadState('domcontentloaded')
    await expect(untrusted.evaluate(() => window.workflowDesktop!.runtime.state())).rejects.toThrow('Недоверенный отправитель')
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find(window => !window.isVisible())?.destroy() })
    const pid = await page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { pid: number }).pid)
    await app.evaluate(({ app }, pid) => {
      if (!app.getAppMetrics().some(metric => metric.pid === pid && metric.name === 'Workflow Architect Runtime')) throw new Error('Not the isolated runtime process')
      process.kill(pid)
    }, pid)
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('unavailable')
    await page.evaluate(() => window.workflowDesktop!.runtime.reconnect())
    await expect.poll(async () => (await get(page, job.id)).status).toBe('waiting')
    const resumed = await get(page, job.id)
    expect(resumed.checkpoint!.runId).toBe(before.checkpoint!.runId)
    expect(resumed.checkpoint!.frames.at(-1)!.human!.request).toEqual(request)
    const answer = await page.evaluate(({ id, owner, requestId }) => window.workflowDesktop!.runtime.request({ kind: 'answer', profileId: owner, id, requestId, value: true }), { id: job.id, owner, requestId: request.id })
    expect(answer).toEqual({ ok: true })
    await expect.poll(async () => (await get(page, job.id)).status).toBe('succeeded')
    expect(JSON.parse((await get(page, job.id)).outcome!.artifacts[0]!.content)).toEqual({ result: 'SERVICE' })
  } finally { await app.close() }
})

test('Run UI preserves profile history across reconnect, window close and native restart', async () => {
  const started = await launch(), directory = started.directory
  let app = started.app, page = started.page
  try {
    await page.getByRole('button', { name: 'Открыть проекты' }).click()
    await page.getByRole('button', { name: /Первый локальный запуск.*Исполнимый пример/ }).click()
    await page.getByRole('button', { name: /^Run ·/ }).click()
    let panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
    await expect(panel.getByText('Фоновый сервис подключён', { exact: true })).toBeVisible()
    await panel.getByLabel('Разрешить этому запуску работать после закрытия окна').check()
    await panel.getByRole('button', { name: 'Запустить workflow' }).click()
    await expect(panel.getByRole('heading', { name: 'Нужен ваш ответ', exact: true })).toBeVisible()
    await expect(panel.getByLabel('Сохранённые запуски').locator('option')).toHaveCount(2)
    const id = await panel.getByLabel('Сохранённые запуски').inputValue()
    const before = await get(page, id)
    const pid = await page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { pid: number }).pid)
    await app.evaluate(({ app }, pid) => {
      if (!app.getAppMetrics().some(metric => metric.pid === pid && metric.name === 'Workflow Architect Runtime')) throw new Error('Unexpected process')
      process.kill(pid)
    }, pid)
    await expect(panel.getByText('Связь с сервисом потеряна', { exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Подтвердить', exact: true })).toBeDisabled()
    await page.screenshot({ path: 'desktop-results/runtime-unavailable.png' })
    await panel.getByRole('button', { name: 'Переподключить' }).click()
    await expect(panel.getByRole('button', { name: 'Подтвердить', exact: true })).toBeEnabled()
    expect((await get(page, id)).checkpoint!.runId).toBe(before.checkpoint!.runId)
    await panel.getByRole('button', { name: 'Скрыть Run' }).click()
    await page.getByRole('button', { name: 'Профили: Профиль 1' }).click()
    await page.getByRole('button', { name: 'Профиль 2 · переключиться' }).click()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await page.getByRole('button', { name: /^Run ·/ }).click()
    panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
    await expect(panel.getByRole('heading', { name: 'История этого профиля · 0' })).toBeVisible()
    expect((await get(page, id)).status).toBe('waiting')
    await panel.getByRole('button', { name: 'Скрыть Run' }).click()
    await page.getByRole('button', { name: 'Профили: Профиль 2' }).click()
    await page.getByRole('button', { name: 'Профиль 1 · переключиться' }).click()
    await expect(page.getByRole('application')).toBeVisible()
    const closed = page.waitForEvent('close')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close())
    await closed
    const opened = app.waitForEvent('window')
    await app.evaluate(({ app }) => { app.emit('second-instance', {}, [], process.cwd()) })
    page = await opened
    await page.getByRole('button', { name: /^Run ·/ }).click()
    panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
    await expect(panel.getByRole('button', { name: 'Подтвердить', exact: true })).toBeEnabled()
    await expect(panel.getByText(/Этот запуск: может работать после закрытия окна/)).toBeVisible()
    await panel.getByRole('button', { name: 'Подтвердить', exact: true }).click()
    await expect(panel.getByRole('heading', { name: 'Завершён', exact: true })).toBeVisible()
    await app.close()
    const restarted = await launch(directory); app = restarted.app; page = restarted.page
    await page.getByRole('button', { name: /^Run ·/ }).click()
    panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
    await expect(panel.getByRole('heading', { name: 'Завершён', exact: true })).toBeVisible()
    await expect(panel.getByLabel('Сохранённые запуски')).toHaveValue(id)
    await expect(panel.locator('.run-artifact')).toHaveCount(1)
    await page.screenshot({ path: 'desktop-results/runtime-history.png' })
    await panel.getByRole('button', { name: 'Удалить запись', exact: true }).click()
    await panel.getByRole('button', { name: 'Удалить окончательно', exact: true }).click()
    await expect(panel.getByRole('heading', { name: 'История этого профиля · 0' })).toBeVisible()
  } finally { await app.close() }
})

test('interrupted foreground run can be cancelled without resuming; immediate reopen tolerates destroyed windows', async () => {
  const started = await launch()
  const app = started.app
  let page = started.page
  try {
    const job = await submit(page, createExecutionExample(), false)
    await expect.poll(async () => (await get(page, job.id)).status).toBe('waiting')
    const pid = await page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { pid: number }).pid)
    await app.evaluate(({ app }, pid) => {
      if (!app.getAppMetrics().some(metric => metric.pid === pid && metric.name === 'Workflow Architect Runtime')) throw new Error('Unexpected process')
      process.kill(pid)
    }, pid)
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('unavailable')
    await page.evaluate(() => window.workflowDesktop!.runtime.reconnect())
    await page.getByRole('button', { name: /^Run ·/ }).click()
    const panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
    await panel.getByLabel('Сохранённые запуски').selectOption(job.id)
    await expect(panel.getByRole('button', { name: 'Продолжить запуск' })).toBeVisible()
    await panel.getByRole('button', { name: 'Остановить запуск' }).click()
    await expect.poll(async () => (await get(page, job.id)).status).toBe('cancelled')
    for (let index = 0; index < 3; index++) {
      const opened = app.waitForEvent('window')
      await app.evaluate(({ app, BrowserWindow }) => {
        const current = BrowserWindow.getAllWindows()[0]!
        current.webContents.once('destroyed', () => { app.emit('second-instance', {}, [], process.cwd()) })
        current.close()
      })
      page = await opened
      await expect(page.getByRole('application')).toBeVisible()
    }
    expect((await get(page, job.id)).status).toBe('cancelled')
  } finally { await app.close() }
})
