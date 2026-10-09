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

import { expect, test, type Page } from './fixtures'

async function russian(page: Page, code: string, key: string, ctrlKey = false) {
  await page.evaluate(({ code, key, ctrlKey }) => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { code, key, ctrlKey, bubbles: true, cancelable: true }))
  }, { code, key, ctrlKey })
}

test('Russian physical shortcuts edit the graph and preserve input and modal scopes', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('application')).toBeVisible()
  const nodes = page.locator('.react-flow__node-workflow')
  await russian(page, 'KeyD', 'в')
  await expect(nodes).toHaveCount(1)
  await russian(page, 'KeyC', 'с', true)
  await russian(page, 'KeyV', 'м', true)
  await expect(nodes).toHaveCount(2)
  await russian(page, 'KeyD', 'в', true)
  await expect(nodes).toHaveCount(3)
  await russian(page, 'KeyA', 'ф', true)
  await expect(page.locator('.react-flow__node-workflow.selected')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await russian(page, 'KeyD', 'в', true)
  await expect(nodes).toHaveCount(3)
  await russian(page, 'KeyZ', 'я', true)
  await expect(nodes).toHaveCount(2)
  await page.getByRole('button', { name: 'Fit View', exact: true }).click()
  await nodes.last().click()
  const title = page.getByRole('textbox', { name: 'Название', exact: true })
  await title.focus()
  await russian(page, 'KeyD', 'в', true)
  await expect(nodes).toHaveCount(2)
  await title.press('Control+a'); await title.press('x')
  await expect(title).toHaveValue('x')
  await russian(page, 'KeyF', 'а', true)
  const search = page.getByRole('dialog', { name: 'Поиск по проекту' })
  await expect(search).toBeVisible()
  await russian(page, 'KeyD', 'в')
  await expect(nodes).toHaveCount(2)
  await page.keyboard.press('Escape')
  await russian(page, 'KeyK', 'л', true)
  await expect(page.getByRole('dialog', { name: 'Команды и узлы' })).toBeVisible()
})
