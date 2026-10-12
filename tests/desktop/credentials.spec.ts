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
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { profileIds } from '../../src/profiles/schema'
import { createExecutionExample } from '../../src/execution/example'

test('Windows DPAPI credentials stay outside projects and logs, persist and revoke', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-credential-desktop-'))
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  delete env.ELECTRON_RUN_AS_NODE
  const launch = () => electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}),
    args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${directory}`], env })
  let app = await launch()
  const secret = 'synthetic-test-only-not-a-real-key-42'
  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await page.getByRole('button', { name: 'Подключения', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: 'Защищённые подключения' })
    await expect(dialog.getByLabel('Название подключения', { exact: true })).toBeEnabled()
    await dialog.getByLabel('Название подключения', { exact: true }).fill('Article provider')
    await dialog.getByLabel('Сервис или назначение', { exact: true }).fill('Synthetic acceptance test')
    await dialog.getByLabel('Ключ или пароль', { exact: true }).fill(secret)
    await expect(dialog.getByLabel('Разрешить использование приложением', { exact: true })).not.toBeChecked()
    await expect(dialog.getByLabel('Ключ или пароль', { exact: true })).toHaveAttribute('type', 'password')
    await dialog.getByRole('button', { name: 'Сохранить защищённое подключение' }).click()
    await expect(dialog.getByRole('article', { name: 'Article provider' })).toContainText('Доступ закрыт')
    await expect(dialog.getByLabel('Ключ или пароль', { exact: true })).toHaveValue('')
    const metadata = await page.evaluate(profileId => window.workflowDesktop!.credentials.request({ kind: 'list', profileId }), profileIds[0]) as { ok: boolean; value: { id: string; enabled: boolean }[] }
    expect(metadata.ok).toBe(true); expect(metadata.value).toHaveLength(1)
    expect(JSON.stringify(metadata)).not.toContain(secret); expect(JSON.stringify(metadata)).not.toContain('ciphertext')
    const id = metadata.value[0]!.id, file = join(directory, 'credentials', `${id}.json`)
    const raw = await readFile(file, 'utf8'), ciphertext = (JSON.parse(raw) as { ciphertext: string }).ciphertext
    expect(raw).not.toContain(secret)
    // Exercise the real OS encryption, using a synthetic value in an isolated test profile.
    expect(await app.evaluate(async ({ safeStorage }, ciphertext) => (await safeStorage.decryptStringAsync(Buffer.from(ciphertext, 'base64'))).result, ciphertext)).toBe(secret)
    const other = await page.evaluate(profileId => window.workflowDesktop!.credentials.request({ kind: 'list', profileId }), profileIds[1])
    expect(other).toEqual({ ok: true, value: [] })
    const denied = await page.evaluate(({ profileId, id }) => window.workflowDesktop!.credentials.request({ kind: 'resolve', profileId, id }), { profileId: profileIds[0], id })
    expect(denied).toMatchObject({ ok: false })
    await dialog.getByRole('button', { name: 'Скопировать ID' }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(id)
    await dialog.getByRole('button', { name: 'Разрешить использование', exact: true }).click()
    await expect(dialog.getByRole('article')).toContainText('Использование разрешено')
    await page.screenshot({ path: 'desktop-results/credentials.png' })
    const project = createExecutionExample(), jobId = randomUUID()
    const submission = JSON.stringify({ kind: 'submit', request: {
      id: jobId, eventKey: jobId, profileId: profileIds[0], project, entryNodeId: project.nodes[0]!.id, input: { text: secret, approved: true }, background: true,
    } })
    await expect(page.evaluate(raw => window.workflowDesktop!.runtime.request(JSON.parse(raw) as unknown), submission)).rejects.toThrow('credential ID')
    expect(await readdir(join(directory, 'runtime', 'jobs'))).toEqual([])
    await dialog.getByRole('button', { name: 'Закрыть диалог', exact: true }).click()
    await app.close(); app = await launch(); page = await app.firstWindow()
    await page.getByRole('button', { name: 'Подключения', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Защищённые подключения' })
    await expect(dialog.getByRole('article')).toContainText('Использование разрешено')
    await dialog.getByRole('button', { name: 'Отозвать доступ' }).click()
    await expect(dialog.getByRole('article')).toContainText('Доступ закрыт')
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ enabled: false })
    await dialog.getByRole('button', { name: 'Удалить', exact: true }).click()
    await dialog.getByRole('button', { name: 'Удалить подключение', exact: true }).click()
    await expect(dialog.getByRole('article')).toHaveCount(0)
    expect(await readdir(join(directory, 'credentials'))).toEqual([])
  } finally { await app.close() }
})
