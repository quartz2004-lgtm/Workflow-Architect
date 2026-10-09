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

import { expect, test } from './fixtures'
import { readFile } from 'node:fs/promises'

test('create and open local projects, reject invalid input, import collisions as independent copies', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '◇ Concept Node' }).click()
  await expect(page.locator('.save-status')).toContainText('Сохранено')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт', exact: false }).click()
  await page.getByRole('button', { name: 'JSON snapshot' }).click()
  await page.getByRole('button', { name: 'Скачать экспорт' }).click()
  const text = await readFile((await (await downloaded).path())!, 'utf8')
  await page.getByRole('button', { name: 'Закрыть диалог' }).click()
  await page.getByRole('button', { name: 'Открыть проекты' }).click()
  const dialog = page.getByRole('dialog', { name: 'Локальные проекты' })
  await dialog.getByRole('textbox', { name: 'Название нового проекта' }).fill('Second system')
  await dialog.getByRole('button', { name: 'Создать пустой проект' }).click()
  await expect(page.getByRole('button', { name: 'Открыть проекты' })).toContainText('Second system')
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Открыть проекты' }).click()
  await dialog.getByRole('button', { name: /Новый workflow/ }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.getByRole('button', { name: 'Открыть проекты' }).click()
  const file = dialog.getByLabel('Файл проекта')
  await file.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') })
  await expect(dialog.getByRole('alert')).toContainText('Некорректный JSON')
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await file.setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Открыть импорт' }).click()
  await expect(page.getByRole('button', { name: 'Открыть проекты' })).toContainText('— импорт')
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await expect(page.locator('.save-status')).toContainText('Сохранено')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Открыть проекты' })).toContainText('— импорт')
  await page.getByRole('button', { name: 'Открыть проекты' }).click()
  await expect(dialog.locator('.project-list button')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/local-projects.png' })
})
