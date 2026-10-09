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
