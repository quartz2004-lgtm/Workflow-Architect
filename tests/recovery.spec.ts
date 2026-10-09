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
import { createNode, createProject } from '../src/domain/factories'

test('damaged config boots into explicit recovery, opens the repaired node and preserves the original record', async ({ page }) => {
  const project = createProject('Damaged research'), node = createNode('agent')
  const raw = JSON.stringify({ ...project, nodes: [{ ...node, title: 'Broken researcher', config: { role: 'Research', model: 123, systemPrompt: 'Find evidence.' } }] })
  await page.goto('/')
  await expect(page.locator('.save-status')).toContainText('Сохранено')
  await page.evaluate(async ({ id, raw }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('workflow-architect', 1)
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['projects', 'preferences'], 'readwrite')
        tx.objectStore('projects').put(raw, id); tx.objectStore('preferences').put(id, 'active-project:00000000-0000-4000-8000-000000000001')
        tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })
  }, { id: project.project.id, raw })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Не удалось открыть проект' })).toBeVisible()
  await page.screenshot({ path: 'test-results/recovery-boot.png' })
  await page.getByRole('button', { name: 'Открыть восстановленную копию' }).click()
  await expect(page.locator('.recovery-banner')).toContainText('Recovery mode')
  await page.getByRole('button', { name: 'Отчёт восстановления' }).click()
  const report = page.getByRole('dialog', { name: 'Отчёт восстановления' })
  await report.getByText('Исходная запись').click()
  await expect(report.locator('pre')).toContainText('"model": 123')
  await report.getByRole('button', { name: 'Открыть элемент' }).first().click()
  await expect(page.getByRole('textbox', { name: 'Роль', exact: true })).toHaveValue('Research')
  await page.getByRole('textbox', { name: 'Роль', exact: true }).fill('Repaired researcher')
  await page.getByRole('textbox', { name: 'Роль', exact: true }).press('Tab')
  await expect(page.locator('.save-status')).toContainText('Сохранено')
  const stored = await page.evaluate(async (id) => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('workflow-architect', 1)
    request.onsuccess = () => {
      const db = request.result, read = db.transaction('projects').objectStore('projects').get(id)
      read.onsuccess = () => { db.close(); resolve(read.result as string) }; read.onerror = () => reject(read.error)
    }
  }), project.project.id)
  expect(stored).toBe(raw)
  await page.reload()
  await expect(page.locator('.react-flow__node')).toContainText('Broken researcher')
  await page.locator('.react-flow__node').click()
  await expect(page.getByRole('textbox', { name: 'Роль', exact: true })).toHaveValue('Repaired researcher')
  await page.getByRole('button', { name: 'Открыть проекты' }).click()
  await page.getByRole('button', { name: 'Damaged research Требуется восстановление', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Открыть восстановленную копию' })).toBeVisible()
})

test('empty state offers three templates and project export defaults persist with undo', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Начать с примера / новый проект' }).click()
  const projects = page.getByRole('dialog', { name: 'Локальные проекты' })
  await expect(projects.locator('.template-list button')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/templates.png' })
  await projects.getByRole('button', { name: 'Multi-agent Research' }).click()
  await expect(page.locator('.react-flow__node-workflow')).toHaveCount(5)
  await expect(page.locator('.react-flow__edge')).toHaveCount(4)
  await page.getByRole('button', { name: 'Fit View', exact: true }).click()
  await page.screenshot({ path: 'test-results/research-template.png' })
  await page.getByRole('button', { name: 'Настройки проекта' }).click()
  await page.getByRole('combobox', { name: 'Экспорт по умолчанию' }).selectOption('codex')
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Экспорт по умолчанию' })).toHaveValue('archive')
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('Сохранено')
  await page.reload()
  await page.getByRole('button', { name: /^Экспорт/ }).click()
  await expect(page.getByRole('button', { name: 'Codex package' })).toHaveAttribute('aria-pressed', 'true')
})
