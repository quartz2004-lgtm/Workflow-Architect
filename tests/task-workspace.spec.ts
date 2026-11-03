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

import { test, expect } from './fixtures'
import { createEditorialExample, defaultEditorialKnowledge } from '../src/execution/editorial-example'

test('revision starts with its own form and preserves the draft across model settings', async ({ page }) => {
  const project = createEditorialExample('test-local', defaultEditorialKnowledge)
  await page.getByRole('button', { name: 'Открыть проекты' }).click()
  await page.getByLabel('Файл проекта').setInputFiles({ name: 'editorial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.getByRole('button', { name: 'Открыть импорт' }).click()
  await page.getByRole('button', { name: 'Изменить текст', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
  await expect(panel.getByRole('combobox', { name: 'Тип результата', exact: true })).toHaveValue('revision')
  await panel.getByRole('textbox', { name: 'Исходный текст', exact: true }).fill('Текст пользователя для правки.')
  await panel.getByRole('textbox', { name: 'Что подготовить?', exact: true }).fill('Уточнить заголовок.')
  await panel.getByRole('button', { name: 'Настройки модели', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'ИИ · Профиль 1' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel.getByRole('textbox', { name: 'Исходный текст', exact: true })).toHaveValue('Текст пользователя для правки.')
  await expect(panel.getByRole('textbox', { name: 'Что подготовить?', exact: true })).toHaveValue('Уточнить заголовок.')
})

test('model availability reports missing installation and never claims generation success', async ({ page }) => {
  await page.evaluate(() => {
    Object.assign(window, { workflowDesktop: { runtime: { request: async (value: { command: { action: string; profileId: string } }) => {
      const command = value.command
      if (command.action === 'state') return { problem: '', connection: { version: '0.4', profileId: command.profileId, enabled: true, configuration: { provider: 'ollama', port: 11434, model: 'test-local:latest' } } }
      if (command.action === 'models') return localStorage.getItem('model-present') ? ['test-local:latest'] : []
      throw new Error('Unexpected request: no generation is allowed in this test')
    } } } })
  })
  await page.getByRole('button', { name: 'Настроить подключения', exact: true }).click()
  const status = page.getByRole('region', { name: 'Готовность модели профиля' })
  await expect(status).toContainText('test-local:latest · настроена')
  await status.getByRole('button', { name: 'Проверить доступность модели' }).click()
  await expect(status).toContainText('не найдена')
  await page.evaluate(() => localStorage.setItem('model-present', 'yes'))
  await status.getByRole('button', { name: 'Проверить доступность модели' }).click()
  await expect(status).toContainText('Это проверка доступности, не генерации или качества текста')
})

test('task workspace connects setup screens and returns without changing the project', async ({ page }) => {
  const workspace = page.getByRole('region', { name: 'Рабочее пространство задач' })
  await expect(workspace).toContainText('Профиль 1')
  await workspace.getByRole('button', { name: 'Настроить подключения' }).click()
  await expect(workspace).toContainText('Локальный ИИ доступен в Windows')
  await expect(workspace.getByRole('button', { name: 'Управлять секретами' })).toBeDisabled()
  await workspace.getByRole('button', { name: 'Настроить и проверить ИИ' }).click()
  await expect(page.getByRole('dialog', { name: 'ИИ · Профиль 1' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(workspace.getByRole('heading', { name: 'Подключить → проверить → использовать' })).toBeVisible()
  await workspace.getByRole('button', { name: 'Создать текст', exact: true }).click()
  await expect(workspace.getByRole('heading', { name: 'Подготовьте задание' })).toBeVisible()
  await expect(workspace.getByRole('button', { name: 'Подготовить редакционный сценарий' })).toBeDisabled()
  await workspace.getByRole('button', { name: 'Задачи и результаты' }).click()
  await expect(page.getByRole('region', { name: 'Локальное выполнение' })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await page.getByRole('button', { name: 'Скрыть Run' }).click()
  await workspace.getByRole('button', { name: 'Настроить подключения' }).click()
  await page.screenshot({ path: 'output/verification-0.5.6/task-workspace.png' })
})
