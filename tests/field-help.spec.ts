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

test('field help supports hover, focus, Escape and contextual almanac without editing the graph', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1000, height: 700 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('application')).toBeVisible()
  await page.keyboard.press('a')
  const role = page.getByRole('textbox', { name: 'Роль', exact: true })
  await role.fill('Исследователь'); await role.press('Enter')
  const trigger = page.getByRole('button', { name: 'Справка: Роль', exact: true })
  await trigger.hover()
  const panel = page.getByRole('region', { name: 'Подсказка: Роль', exact: true })
  await expect(panel).toContainText('Кем является агент и за какую часть результата отвечает.')
  await expect(panel).toBeInViewport()
  await panel.hover()
  await expect(panel).toBeVisible()
  await page.screenshot({ path: 'test-results/field-help-role.png' })
  await page.mouse.move(10, 10)
  await expect(panel).toHaveCount(0)
  await trigger.focus()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  await panel.getByRole('button', { name: 'Подробнее в альманахе' }).click()
  const almanac = page.getByRole('dialog', { name: 'Альманах Workflow Architect' })
  await expect(almanac.getByRole('heading', { name: 'Agent: роль, модель и инструкции' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(role).toHaveValue('Исследователь')
  await expect(page.locator('.react-flow__node-workflow')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('nested resource dialogs show field help above the modal and preserve text labels', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Общие схемы и prompts', exact: true }).click()
  const resources = page.getByRole('dialog', { name: 'Общие схемы и prompts' })
  await resources.getByRole('button', { name: '＋ Общая схема' }).click()
  await resources.getByRole('button', { name: 'Справка: JSON Schema', exact: true }).focus()
  const help = page.getByRole('region', { name: 'Подсказка: JSON Schema', exact: true })
  await expect(help).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
  await expect(resources).toBeVisible()
  await expect(resources.getByRole('textbox', { name: 'JSON Schema', exact: true })).toBeVisible()
})
