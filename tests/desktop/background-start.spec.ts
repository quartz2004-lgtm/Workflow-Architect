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
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('background boot opens no window and accepts an early request to open the editor', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-background-boot-'))
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}),
    args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${directory}`, '--background'], env })
  try {
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0)
    const opened = app.waitForEvent('window')
    await app.evaluate(({ app }) => { app.emit('second-instance', {}, [], process.cwd()) })
    const page = await opened
    await expect(page.getByRole('button', { name: 'Пропустить настройку' })).toBeVisible()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await expect(page.getByRole('application')).toBeVisible()
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('ready')
  } finally { await app.close() }
})
