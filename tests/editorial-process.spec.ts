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

import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { EditorialProcessService } from '../src/editorial/process-service'
import { runtimeCommandSchema } from '../src/runtime/service-protocol'
import { profileIds } from '../src/profiles/schema'

async function removeTestDirectory(root: string) {
  const target = resolve(root), parent = resolve(tmpdir()) + sep
  if (!target.startsWith(parent) || !target.slice(parent.length).startsWith('wa-editorial-ui-')) throw new Error('Unexpected temporary directory')
  await rm(target, { recursive: true, force: true })
}

test('editorial settings require explicit adoption and preserve versions after revocation', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'wa-editorial-ui-'))
  const service = new EditorialProcessService(root)
  try {
    await page.exposeFunction('editorialRuntime', async (raw: unknown) => {
      const command = runtimeCommandSchema.parse(raw)
      if (command.kind === 'editorial-process') return service.handle(command.command)
      if (command.kind === 'list') return []
      throw new Error('Model connection is outside this settings test')
    })
    await page.addInitScript(() => {
      const bridge = window as unknown as { editorialRuntime(value: unknown): Promise<unknown> }
      const ready = async () => ({ status: 'ready', message: '', damaged: [] })
      Object.assign(window, { workflowDesktop: { runtime: { request: (value: unknown) => bridge.editorialRuntime(value), state: ready, reconnect: ready, subscribe: () => () => {} }, onBeforeClose: () => {} } })
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await page.getByRole('button', { name: 'ИИ-помощник', exact: true }).click()
    await page.getByRole('button', { name: '04 · Редакция и голос' }).click()
    const panel = page.getByRole('region', { name: 'Редакция и голос' })
    await expect(panel).toContainText('Версий пока нет')
    await panel.getByLabel('Название или происхождение').fill('Пример владельца')
    await panel.getByLabel('Текст примера · до 3000 символов').fill('Выбирайте подарок под привычки человека. Начните с того, что он носит каждый день.')
    await panel.getByRole('button', { name: 'Сохранить черновик примера' }).click()
    await expect(panel.getByText('Пример владельца · Черновик', { exact: true })).toBeVisible()
    await expect(panel.getByRole('checkbox')).toHaveCount(0)
    await panel.getByText('Пример владельца · Черновик', { exact: true }).click()
    await panel.getByRole('button', { name: 'Принять этот текст как пример стиля' }).click()
    await panel.getByRole('checkbox', { name: 'Пример владельца' }).check()
    await panel.getByLabel('Название', { exact: true }).fill('Спокойный голос')
    await panel.getByRole('button', { name: 'Сохранить новую версию' }).click()
    await expect(panel.getByRole('button', { name: 'Использовать версию 1' })).toBeEnabled()
    const owner = profileIds.find(id => service.read(id).versions.length === 1)!
    expect(owner).toBeTruthy()
    expect(service.read(owner).selectedVersionId).toBeNull()
    await panel.getByRole('button', { name: 'Использовать версию 1' }).click()
    await expect(panel).toContainText('Для новых редакционных задач: Спокойный голос, версия 1.')
    await panel.getByRole('button', { name: 'Отозвать пример' }).click()
    await expect(panel).toContainText('В выбранной версии есть отозванный пример')
    await panel.getByRole('button', { name: 'Взять за основу' }).click()
    await panel.getByRole('checkbox', { name: /Отозван/ }).click()
    await expect(panel.getByRole('checkbox', { name: /Отозван/ })).toHaveCount(0)
    await panel.getByRole('button', { name: 'Сохранить новую версию' }).click()
    await panel.getByRole('button', { name: 'Использовать версию 2' }).click()
    await expect(panel).toContainText('Для новых редакционных задач: Спокойный голос, версия 2.')
    const restored = new EditorialProcessService(root).read(owner)
    expect(restored.versions).toHaveLength(2)
    expect(restored.versions[0]!.content.voiceExampleIds).toHaveLength(1)
    expect(restored.versions[1]!.content.voiceExampleIds).toHaveLength(0)
    expect(restored.selectedVersionId).toBe(restored.versions[1]!.id)
    expect(service.read(profileIds.find(id => id !== owner)! ).versions).toHaveLength(0)
    await panel.getByRole('button', { name: 'Стандартная редакция', exact: true }).click()
    await expect(panel).toContainText('Для новых задач используются настройки узла')
    await panel.scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'output/verification-0.5.5/editorial-settings.png' })
    await page.setViewportSize({ width: 850, height: 800 })
    await page.screenshot({ path: 'output/verification-0.5.5/editorial-settings-compact.png' })
  } finally {
    await removeTestDirectory(root)
  }
})
