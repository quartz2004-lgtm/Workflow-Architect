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
import { resolve, join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'

async function launch(profile: string, skipSetup = true) {
  const environment: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  delete environment.ELECTRON_RUN_AS_NODE
  const application = await electron.launch({
    ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}),
    args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${profile}`],
    env: environment,
  })
  const page = await application.firstWindow()
  await expect(page.getByRole('application').or(page.getByRole('button', { name: 'Пропустить настройку' }))).toBeVisible()
  if (skipSetup && await page.getByRole('button', { name: 'Пропустить настройку' }).isVisible()) await page.getByRole('button', { name: 'Пропустить настройку' }).click()
  return application
}

test('desktop first setup persists personal settings across native restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-desktop-setup-'))
  let application = await launch(directory, false)
  try {
    let page = await application.firstWindow()
    await page.getByLabel('Имя профиля', { exact: true }).fill('Desktop profile')
    await page.getByRole('button', { name: 'Далее', exact: true }).click()
    await page.getByRole('button', { name: 'К рекомендациям' }).click()
    await page.getByLabel('Движение интерфейса').selectOption('reduced')
    await page.getByRole('button', { name: 'Сохранить и открыть редактор' }).click()
    await expect(page.getByRole('button', { name: 'Профили: Desktop profile' })).toBeVisible()
    await expect(page.locator('.save-status')).toContainText('Сохранено')
    await application.close()
    application = await launch(directory, false)
    page = await application.firstWindow()
    await expect(page.getByRole('button', { name: 'Профили: Desktop profile' })).toBeVisible()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-motion', 'reduced')
  } finally { await application.close() }
})

test('desktop shortcuts and contextual field help work without changing the project format', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'workflow-desktop-help-'))
  const application = await launch(profile)
  try {
    const page = await application.firstWindow()
    await expect(page.getByRole('application')).toBeVisible()
    await page.keyboard.press('a')
    await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v')
    await expect(page.locator('.react-flow__node-workflow')).toHaveCount(2)
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'в', ctrlKey: true, bubbles: true, cancelable: true })))
    await expect(page.locator('.react-flow__node-workflow')).toHaveCount(3)
    const help = page.getByRole('button', { name: 'Справка: Роль', exact: true })
    await help.focus()
    const panel = page.getByRole('region', { name: 'Подсказка: Роль', exact: true })
    await expect(panel).toContainText('Кем является агент')
    await panel.getByRole('button', { name: 'Подробнее в альманахе' }).click()
    await expect(page.getByRole('heading', { name: 'Agent: роль, модель и инструкции' })).toBeVisible()
    await page.screenshot({ path: 'desktop-results/contextual-almanac.png' })
    await page.keyboard.press('Escape')
    await expect(help).toBeFocused()
    await expect(page.locator('.react-flow__node-workflow')).toHaveCount(3)
  } finally { await application.close() }
})

test('offline desktop: sandbox, edit, close with pending input, restart, native export and ZIP import', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'workflow-desktop-'))
  let application = await launch(profile)
  try {
    expect(await application.evaluate(({ app }) => app.getPath('userData'))).toBe(profile)
    let page = await application.firstWindow()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await expect(page.getByRole('heading', { name: 'Сначала замысел.' })).toBeVisible()
    expect(page.url()).toBe('workflow://app/index.html')
    expect(await page.evaluate(() => ({ secure: isSecureContext, node: typeof (globalThis as unknown as { require?: unknown }).require, bridge: Object.keys(window.workflowDesktop ?? {}) }))).toEqual({ secure: true, node: 'undefined', bridge: ['onBeforeClose'] })
    // CDP evaluate bypasses CSP; insertion into the document exercises its policy.
    await expect(page.addScriptTag({ content: 'window.unsafeDesktopScript = true' })).rejects.toThrow()
    await page.getByRole('button', { name: '✦ Agent' }).click()
    await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Desktop researcher')
    // Close immediately, without blur or waiting for the 450 ms autosave debounce.
    const closed = application.waitForEvent('close')
    await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.close() })
    await closed
    application = await launch(profile)
    page = await application.firstWindow()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    await expect(page.locator('.react-flow__node')).toContainText('Desktop researcher')
    const exported = join(profile, 'desktop-export.zip')
    // Select a destination from the test process; production still uses native Save As.
    await application.evaluate(({ session }, path) => {
      session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path))
    }, exported)
    await page.getByRole('button', { name: /^Экспорт/ }).click()
    await page.getByRole('button', { name: 'Codex package' }).click()
    await page.getByRole('button', { name: 'Скачать экспорт' }).click()
    await expect.poll(async () => (await readFile(exported).catch(() => Buffer.alloc(0))).length).toBeGreaterThan(100)
    const files = unzipSync(await readFile(exported))
    expect(JSON.parse(strFromU8(files['workflow.json']!)).nodes[0].title).toBe('Desktop researcher')
    expect(files['AGENTS.md']).toBeDefined()
    await page.getByRole('button', { name: 'Закрыть диалог' }).click()
    await page.getByRole('button', { name: 'Открыть проекты' }).click()
    await page.getByLabel('Файл проекта').setInputFiles(exported)
    await page.getByRole('button', { name: 'Открыть импорт' }).click()
    await expect(page.getByRole('button', { name: 'Открыть проекты' })).toContainText('— импорт')
    await expect(page.locator('.react-flow__node')).toContainText('Desktop researcher')
    await page.getByRole('button', { name: 'Fit View', exact: true }).click()
    await page.screenshot({ path: 'desktop-results/windows-editor.png' })
    expect(errors).toEqual([])
  } finally { await application.close() }
})

test('failed close-save returns to the editor instead of losing changes', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'workflow-close-failure-'))
  const application = await launch(profile)
  try {
    const page = await application.firstWindow()
    await expect(page.getByRole('button', { name: '◇ Concept Node' })).toBeVisible()
    await page.getByRole('button', { name: '◇ Concept Node' }).click()
    await page.evaluate(() => window.workflowDesktop!.onBeforeClose(async () => false))
    await application.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
      BrowserWindow.getAllWindows()[0]!.close()
    })
    await expect(page.locator('.react-flow__node')).toHaveCount(1)
    await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Still editable')
    await page.getByRole('textbox', { name: 'Описание', exact: true }).click()
    await expect(page.locator('.react-flow__node')).toContainText('Still editable')
    await expect(page.locator('.save-status')).toContainText('Сохранено')
    await page.evaluate(() => window.workflowDesktop!.onBeforeClose(async () => true))
  } finally { await application.close() }
})

test('desktop almanac is available offline and saves the complete HTML manual', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'workflow-almanac-'))
  const application = await launch(profile)
  try {
    const page = await application.firstWindow()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: 'Альманах', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Альманах Workflow Architect' })
    await dialog.getByRole('searchbox', { name: 'Поиск по альманаху' }).fill('additionalProperties')
    await expect(dialog.getByRole('article')).toContainText('Контракты и JSON Schema')
    const exported = join(profile, 'almanac.html')
    await application.evaluate(({ session }, path) => {
      session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path))
    }, exported)
    await dialog.getByRole('button', { name: 'Сохранить альманах' }).click()
    await expect.poll(async () => (await readFile(exported, 'utf8').catch(() => '')).includes('</html>')).toBe(true)
    const html = await readFile(exported, 'utf8')
    expect(html).toContain('Первый проект за 10 шагов')
    expect(html).toContain('Границы версии и частые вопросы')
    expect(html).not.toContain('<script')
    await page.screenshot({ path: 'desktop-results/almanac-installed.png' })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Альманах', exact: true })).toBeFocused()
  } finally { await application.close() }
})
