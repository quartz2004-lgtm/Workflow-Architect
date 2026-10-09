import { expect, test } from '@playwright/test'

test('automatic height, compatible ports and palette conversion keep edits undoable', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '◇ Concept Node' }).click()
  const first = page.locator('.react-flow__node-workflow').first()
  const description = page.getByRole('textbox', { name: 'Описание', exact: true })
  await description.fill('Подробное описание ответственности этого шага. '.repeat(12)); await description.press('Tab')
  const before = (await first.boundingBox())!.height
  await page.getByRole('button', { name: 'Автовысота по содержимому' }).click()
  await expect.poll(async () => (await first.boundingBox())!.height).toBeGreaterThan(before + 100)
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect.poll(async () => (await first.boundingBox())!.height).toBeCloseTo(before, 0)
  await page.getByRole('button', { name: '◇ Concept Node' }).click()
  const second = page.locator('.react-flow__node-workflow').nth(1)
  await page.getByRole('button', { name: 'Fit View', exact: true }).click()
  const port = (await first.locator('.source').boundingBox())!
  await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2); await page.mouse.down()
  await page.mouse.move(port.x + 40, port.y + 20, { steps: 5 })
  await expect(second.locator('.target')).toHaveClass(/port-compatible/)
  await expect(second.locator('.source')).toHaveClass(/port-incompatible/)
  await page.screenshot({ path: 'test-results/compatible-ports.png' })
  const target = (await second.locator('.target').boundingBox())!
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2); await page.mouse.up()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await second.click()
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'Поиск команд' }).fill('Convert → Artifact')
  await page.keyboard.press('Enter')
  await expect(second).toContainText('ARTIFACT')
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(second).toContainText('CONCEPT')
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
})
