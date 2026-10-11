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

import { readFile } from 'node:fs/promises'
import { test, expect } from './fixtures'

test('real Worker executes both branches and nested calls, waits for Human and saves actual artifacts', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: 'Открыть проекты' }).click()
  await page.getByRole('button', { name: /Первый локальный запуск.*Исполнимый пример/ }).click()
  await page.getByRole('button', { name: /^Run ·/ }).click()
  const panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
  for (const approved of [true, false]) {
    await panel.getByRole('textbox', { name: 'Вход запуска (JSON)' }).fill(JSON.stringify({ approved, text: 'Проверка Worker' }))
    await panel.getByRole('button', { name: 'Запустить workflow' }).click()
    await expect(panel.getByRole('heading', { name: 'Нужен ваш ответ', exact: true })).toBeVisible()
    await panel.getByRole('button', { name: 'Подтвердить', exact: true }).click()
    await expect(panel.getByRole('heading', { name: 'Завершён', exact: true })).toBeVisible()
    await panel.locator('.run-artifact summary').click()
    const download = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Сохранить result.json', exact: true }).click()
    const artifact = JSON.parse(await readFile((await (await download).path())!, 'utf8')) as { result: string }
    expect(artifact.result).toBe(approved ? 'ПРОВЕРКА WORKER' : 'Нужна доработка')
    await expect(panel.locator('.run-event-step-start').filter({ hasText: 'Текст в верхний регистр' })).toHaveCount(approved ? 1 : 0)
  }
  expect(errors).toEqual([])
  await page.screenshot({ path: 'output/verification-0.3.0/run-wide.png' })
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(panel.getByRole('button', { name: 'Запустить workflow' })).toBeVisible()
  const bounds = await panel.boundingBox()
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1024)
  await page.screenshot({ path: 'output/verification-0.3.0/run-compact.png' })
})

test('cancel waiting Worker, rerun from a clean state and retain snapshot while editing', async ({ page }) => {
  await page.getByRole('button', { name: 'Открыть проекты' }).click()
  await page.getByRole('button', { name: /Первый локальный запуск.*Исполнимый пример/ }).click()
  await page.getByRole('button', { name: /^Run ·/ }).click()
  const panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
  await panel.getByRole('textbox', { name: 'Вход запуска (JSON)' }).fill('{"approved":false}')
  await panel.getByRole('button', { name: 'Запустить workflow' }).click()
  await expect(panel.getByRole('button', { name: 'Подтвердить', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Остановить запуск' }).click()
  await expect(panel.getByRole('heading', { name: 'Отменён', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Подтвердить', exact: true })).toHaveCount(0)
  await expect(panel.locator('.run-artifact')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Запустить workflow' }).click()
  await expect(panel.getByRole('button', { name: 'Подтвердить', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Скрыть Run' }).click()
  await page.getByRole('button', { name: 'Настройки проекта' }).click()
  await page.getByRole('textbox', { name: 'Название проекта', exact: true }).fill('Изменён во время выполнения')
  await page.getByRole('textbox', { name: 'Название проекта', exact: true }).press('Enter')
  await page.getByRole('button', { name: /^Run ·/ }).click()
  await expect(panel).toContainText('Снимок: Первый локальный запуск')
  await panel.getByRole('button', { name: 'Подтвердить', exact: true }).click()
  await expect(panel.getByRole('heading', { name: 'Завершён', exact: true })).toBeVisible()
  await expect(panel.locator('.run-artifact')).toHaveCount(1)
})

test('Inspector configures execution through forms, undo and persisted reload', async ({ page }) => {
  await page.getByRole('button', { name: /Trigger.*Начало workflow/ }).click()
  await page.getByRole('combobox', { name: 'Операция', exact: true }).selectOption('manual')
  await page.getByRole('button', { name: /Data.*Данные/ }).click()
  await page.getByRole('combobox', { name: 'Операция', exact: true }).selectOption('map')
  await page.getByRole('button', { name: '＋ Выходное поле' }).click()
  await page.getByRole('textbox', { name: 'Имя выходного поля', exact: true }).fill('answer')
  await page.getByRole('textbox', { name: 'Имя выходного поля', exact: true }).press('Enter')
  await page.getByRole('combobox', { name: 'Источник значения', exact: true }).selectOption('literal')
  await page.getByRole('textbox', { name: 'Значение', exact: true }).fill('готово')
  await page.getByRole('textbox', { name: 'Значение', exact: true }).press('Enter')
  await page.getByRole('combobox', { name: 'Преобразование', exact: true }).selectOption('uppercase')
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Преобразование', exact: true })).toHaveValue('identity')
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Преобразование', exact: true })).toHaveValue('uppercase')
  await page.getByRole('button', { name: /Artifact.*Результат/ }).click()
  await page.getByRole('combobox', { name: 'Операция', exact: true }).selectOption('artifact')
  const nodes = page.locator('.react-flow__node')
  await nodes.filter({ hasText: 'trigger' }).locator('.source').dragTo(nodes.filter({ hasText: 'data' }).locator('.target'))
  await nodes.filter({ hasText: 'data' }).locator('.source').dragTo(nodes.filter({ hasText: 'artifact' }).locator('.target'))
  await expect(page.locator('.save-status')).toContainText('Сохранено')
  await page.reload()
  await page.getByRole('button', { name: /^Run ·/ }).click()
  const panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
  await panel.getByRole('button', { name: 'Запустить workflow' }).click()
  await expect(panel.getByRole('heading', { name: 'Завершён', exact: true })).toBeVisible()
  await panel.locator('.run-artifact summary').click()
  await expect(panel.locator('.run-artifact pre')).toContainText('ГОТОВО')
})
