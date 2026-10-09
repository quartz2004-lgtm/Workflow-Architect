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

import { test as base, expect } from '@playwright/test'
export { expect }
export type { Page } from '@playwright/test'

/** Existing editor scenarios enter through the real first-run skip action. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Пропустить настройку', exact: true }).click()
    await expect(page.getByRole('application')).toBeVisible()
    await expect(page.locator('.save-status')).toContainText('Сохранено')
    await use(page)
  },
})
