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

test('two windows preserve both edits and let the stale writer continue in a separate project', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.locator('.save-status')).toContainText('Сохранено')
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.locator('.save-status')).toContainText('Сохранено')
  const firstName = page.getByRole('textbox', { name: 'Название проекта', exact: true })
  await firstName.fill('First window'); await firstName.press('Enter')
  await expect(page.locator('.save-status')).toContainText('Сохранено')
  const secondName = other.getByRole('textbox', { name: 'Название проекта', exact: true })
  await secondName.fill('Second window'); await secondName.press('Enter')
  await expect(other.getByRole('alert')).toContainText('Проект изменён в другом окне')
  await expect(secondName).toHaveValue('Second window')
  await other.getByRole('button', { name: 'Сохранить мои правки отдельной копией' }).click()
  await expect(other.locator('.save-status')).toContainText('Сохранено')
  await other.getByRole('button', { name: 'Открыть проекты' }).click()
  const projects = other.getByRole('dialog', { name: 'Локальные проекты' })
  await expect(projects.locator('.project-list')).toContainText('First window')
  await expect(projects.locator('.project-list')).toContainText('Second window — моя копия')
  await projects.getByRole('button', { name: /First window/ }).click()
  await expect(secondName).toHaveValue('First window')
  await expect(other.locator('.save-status')).toContainText('Сохранено')
})
