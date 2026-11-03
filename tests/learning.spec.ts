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

test('guided tours highlight real controls, resume after reload, and leave working projects unchanged', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByRole('complementary', { name: 'Знакомство с приложением' })).toBeVisible()
  await page.getByRole('button', { name: 'Пройти знакомство', exact: true }).click()
  await page.getByRole('button', { name: 'Начать · Получить результат', exact: true }).click()
  const tour = page.getByRole('dialog', { name: 'Обучение: Получить результат', exact: true })
  await expect(tour.getByRole('heading', { name: 'Начните со сценария' })).toBeFocused()
  await expect(tour.locator('.tour-highlight')).toHaveCount(1)
  await page.screenshot({ path: 'output/verification-0.5.6/tour-result.png' })
  await tour.getByRole('button', { name: 'Далее', exact: true }).click()
  await expect(tour.getByRole('heading', { name: 'Проверьте свой профиль' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(tour).toHaveCount(0)
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Пройти знакомство', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.getByRole('button', { name: 'Продолжить · Получить результат', exact: true }).click()
  await expect(tour.getByRole('heading', { name: 'Проверьте свой профиль' })).toBeVisible()
  for (let i = 1; i < 7; i++) {
    await expect(tour.locator('.tour-highlight')).toHaveCount(1)
    await expect(tour.getByText('Область сейчас скрыта.', { exact: false })).toHaveCount(0)
    await tour.getByRole('button', { name: i === 6 ? 'Завершить обзор' : 'Далее', exact: true }).click()
  }
  await expect(page.getByText('Обзор завершён. Это не оценка навыков.')).toBeVisible()
  await page.getByRole('button', { name: 'Начать · Работать со схемой', exact: true }).click()
  const canvasTour = page.getByRole('dialog', { name: 'Обучение: Работать со схемой', exact: true })
  await page.setViewportSize({ width: 900, height: 700 })
  for (let i = 0; i < 7; i++) {
    await expect(canvasTour.locator('.tour-highlight')).toHaveCount(1)
    await expect(canvasTour.getByRole('heading')).toBeInViewport()
    if (i === 2) await page.screenshot({ path: 'output/verification-0.5.6/tour-canvas-compact.png' })
    await canvasTour.getByRole('button', { name: i === 6 ? 'Завершить обзор' : 'Далее', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Открыть учебный проект', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Учебный проект', exact: true })).toBeVisible()
  await page.locator('.library').getByRole('button', { name: /Concept Node/ }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.getByRole('button', { name: 'Вернуться к рабочему проекту' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Открыть проекты' })).toContainText('Новый workflow')
})

test('skip is profile-local and help can reopen learning with keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Пропустить знакомство' }).click()
  await page.getByRole('button', { name: 'Альманах', exact: true }).click()
  await page.getByRole('button', { name: 'Пошаговое обучение', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Обучение работе с приложением' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Профили:/ }).click()
  await page.getByRole('button', { name: 'Профиль 2 · переключиться', exact: true }).click()
  await page.getByRole('button', { name: 'Пропустить настройку', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пройти знакомство', exact: true })).toBeVisible()
})
