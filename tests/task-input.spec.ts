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
import { createEdge, createNode, createProject } from '../src/domain/factories'

test('task input survives closing, separates JSON and form drafts, validates before a real run', async ({ page }) => {
  const project = createProject('Проверка формы задания')
  const trigger = createNode('trigger'), artifact = createNode('artifact')
  if (trigger.type !== 'trigger') throw new Error('Trigger factory')
  trigger.operation = { kind: 'manual' }
  trigger.config.triggerType = 'manual'
  trigger.config.payload = { kind: 'json-schema', schema: {
    type: 'object', properties: { text: { type: 'string', title: 'Текст задания', minLength: 3 }, count: { type: 'integer', title: 'Количество', minimum: 1 }, approved: { type: 'boolean', title: 'Разрешено' } },
    required: ['text', 'count', 'approved'], additionalProperties: false,
  } }
  artifact.operation = { kind: 'artifact', filename: 'form.json', format: 'json', source: { kind: 'input', pointer: '' } }
  project.nodes = [trigger, artifact]
  project.edges = [createEdge(trigger.id, artifact.id, trigger.ports[1]!.id, artifact.ports[0]!.id)]
  await page.getByRole('button', { name: 'Открыть проекты' }).click()
  await page.getByLabel('Файл проекта', { exact: true }).setInputFiles({ name: 'input.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.getByRole('button', { name: 'Открыть импорт', exact: true }).click()
  await page.getByRole('button', { name: /^Run ·/ }).click()
  const panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
  await panel.getByLabel('Текст задания · обязательно').fill('Не потерять задание')
  await panel.getByLabel('Количество · обязательно').fill('0')
  await panel.getByLabel('Разрешено · обязательно').selectOption('false')
  await panel.getByRole('button', { name: 'Скрыть Run' }).click()
  await page.getByRole('button', { name: /^Run ·/ }).click()
  await expect(panel.getByLabel('Текст задания · обязательно')).toHaveValue('Не потерять задание')
  await panel.getByLabel('Технический ввод JSON вместо формы').check()
  await panel.getByLabel('Вход запуска (JSON)').fill('{"text":"Другой черновик","count":2,"approved":true}')
  await panel.getByLabel('Технический ввод JSON вместо формы').uncheck()
  await expect(panel.getByLabel('Текст задания · обязательно')).toHaveValue('Не потерять задание')
  await panel.getByRole('button', { name: 'Запустить workflow' }).click()
  await expect(panel.getByRole('alert')).toContainText('minimum')
  await expect(panel.getByRole('heading', { name: 'Готов к запуску', exact: true })).toBeVisible()
  await panel.getByLabel('Количество · обязательно').fill('2')
  await panel.getByRole('button', { name: 'Запустить workflow' }).click()
  await expect(panel.getByRole('heading', { name: 'Завершён', exact: true })).toBeVisible()
  await panel.locator('.run-artifact summary').click()
  expect(JSON.parse(await panel.locator('.run-artifact pre').innerText())).toEqual({ text: 'Не потерять задание', count: 2, approved: false })
})
