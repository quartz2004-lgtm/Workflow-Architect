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

test('preview is a transient, accessible graph overlay with pause, steps and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Начать с примера / новый проект' }).click()
  await page.getByRole('button', { name: 'Multi-agent Research' }).click()
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  const preview = page.getByRole('region', { name: 'Архитектурный Preview' })
  await expect(preview).toContainText('Пауза')
  await expect(page.locator('[data-status=running]')).toHaveCount(1)
  await preview.getByRole('button', { name: 'Следующий шаг' }).click()
  await expect(preview).toContainText('Planner')
  await expect(page.locator('.preview-edge')).toHaveCount(1)
  await expect(page.locator('[data-status=success]')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/preview-reduced-motion.png' })
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeDisabled()
  for (let i = 0; i < 4; i++) await preview.getByRole('button', { name: 'Следующий шаг' }).click()
  await expect(preview).toContainText('Обход завершён')
  await expect(page.locator('[data-status=success]')).toHaveCount(5)
  await preview.getByRole('button', { name: 'Закрыть Preview' }).click()
  await expect(page.locator('[data-status=success]')).toHaveCount(0)
  await page.reload()
  await expect(preview).toHaveCount(0)
})
