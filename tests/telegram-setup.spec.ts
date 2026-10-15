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
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { IntegrationService } from '../src/integrations/service'
import { JobManager } from '../src/runtime/job-manager'
import { ConnectionStore } from '../src/ai/connection-store'
import { credentialCommandSchema, type CredentialView } from '../src/credentials/schema'
import { profileIds } from '../src/profiles/schema'
import type { TelegramUpdate } from '../src/integrations/telegram-api'

test('Telegram wizard creates a protected connection, binds a chat and activates a compatible saved project', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'wa-wizard-')), jobs = new JobManager(join(root, 'jobs'))
  const credentials = new Map<string, CredentialView>(), secrets = new Map<string, string>(), updates: TelegramUpdate[] = [], messages: string[] = []
  const service = new IntegrationService(join(root, 'integrations'), 'unused', async (profileId, id) => {
    if (credentials.get(id)?.profileId !== profileId) throw new Error('Wrong profile')
    return secrets.get(id) ?? ''
  }, jobs, new ConnectionStore(join(root, 'models')), async request => {
    const method = request.url.pathname.split('/').at(-1)
    if (method === 'getMe') return { ok: true, result: { id: 999999, is_bot: true, username: 'wizard_test_bot' } }
    if (method === 'getWebhookInfo') return { ok: true, result: { url: '' } }
    if (method === 'getUpdates') { await new Promise(resolve => setTimeout(resolve, 20)); request.signal.throwIfAborted(); return { ok: true, result: updates.splice(0) } }
    messages.push(String(request.body)); return { ok: true, result: { message_id: messages.length } }
  })
  service.start()
  try {
    await page.exposeFunction('wizardRuntime', async (raw: unknown) => {
      const command = z.object({ kind: z.string(), command: z.unknown().optional() }).parse(raw)
      if (command.kind === 'integrations') return service.handle(command.command)
      if (command.kind === 'list') return []
      throw new Error(`Unexpected runtime command: ${command.kind}`)
    })
    await page.exposeFunction('wizardCredentials', async (raw: unknown) => {
      const command = credentialCommandSchema.parse(raw)
      if (command.kind === 'list') return { ok: true, value: [...credentials.values()].filter(item => item.profileId === command.profileId) }
      if (command.kind === 'create') {
        const { secret, kind: _kind, ...metadata } = command
        void _kind
        const record = { ...metadata, available: true, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        credentials.set(record.id, record); secrets.set(record.id, secret)
        return { ok: true, value: record }
      }
      throw new Error('Unexpected credential operation')
    })
    await page.addInitScript(() => {
      const bridge = window as unknown as { wizardRuntime(value: unknown): Promise<unknown>; wizardCredentials(value: unknown): Promise<unknown> }
      const ready = async () => ({ status: 'ready', message: '', damaged: [] })
      Object.assign(window, { workflowDesktop: { credentials: { request: (value: unknown) => bridge.wizardCredentials(value) }, runtime: { request: (value: unknown) => bridge.wizardRuntime(value), state: ready, reconnect: ready, subscribe: () => () => {} }, onBeforeClose: () => {} } })
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await page.getByRole('button', { name: 'Открыть проекты' }).click()
    await page.getByRole('button', { name: /Первый локальный запуск.*Исполнимый пример/ }).click()
    await page.getByRole('button', { name: 'Интеграции', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /Интеграции/ })
    await dialog.getByRole('button', { name: 'Другие подключения', exact: true }).click()
    await expect(dialog.getByLabel('Сервис')).not.toContainText('Telegram')
    await dialog.getByRole('button', { name: 'Расписание и публикации', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'Привязанные чаты', exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Telegram · начать здесь', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: '1. Подключите бота' })).toBeVisible()
    await dialog.getByLabel('Токен бота', { exact: true }).fill('999999:abcdefghijklmnopqrstuvwxyz123456')
    await expect(dialog.getByRole('button', { name: 'Сохранить и продолжить' })).toBeDisabled()
    await dialog.getByLabel('Разрешить приложению использовать этого бота в текущем профиле').check()
    await dialog.getByRole('button', { name: 'Сохранить и продолжить' }).click()
    await expect(dialog.getByText('Бот проверен', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Получить команду для привязки' }).click()
    const start = await dialog.locator('.integration-pair code').innerText()
    updates.push({ update_id: 1, message: { message_id: 1, from: { id: 111, is_bot: false }, chat: { id: 111, type: 'private' }, text: start } })
    await expect(dialog.getByText('Сценарий ещё не включён', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(dialog).toContainText('ожидает поле /approved')
    await expect(dialog.getByRole('button', { name: 'Включить для этого чата', exact: true })).toBeDisabled()
    await dialog.getByText('Начать с готового сценария', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Статьи и правки · нужна Ollama' }).click()
    await expect(dialog).toContainText('В этом профиле ИИ не подключён')
    await expect(dialog.getByRole('button', { name: 'Включить для этого чата', exact: true })).toBeDisabled()
    await dialog.getByText('В этом профиле ИИ не подключён', { exact: false }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'output/verification-0.5.1/telegram-model-required.png' })
    await dialog.getByRole('button', { name: 'Подтверждение и файл · без ИИ' }).click()
    await dialog.getByRole('button', { name: 'Включить для этого чата', exact: true }).click()
    await expect(dialog.locator('.telegram-active')).toContainText('Telegram · Подтверждение и файл')
    const binding = service.sources.listBindings(profileIds[0])[0]!
    expect(binding.workflowId).not.toBeNull()
    expect(service.sources.listBindings(profileIds[1])).toEqual([])
    await dialog.getByRole('button', { name: 'Отправить тестовое сообщение' }).click()
    await expect(dialog).toContainText('Telegram подтвердил отправку тестового сообщения')
    expect(messages.some(message => message.includes('Активный сценарий: Telegram'))).toBe(true)
    expect(messages.some(message => message.includes('keyboard') && message.includes('Новый текст'))).toBe(true)
    expect(JSON.stringify(service.connections.list(profileIds[0]))).not.toContain('abcdefghijklmnopqrstuvwxyz')
    const firstPublication = service.sources.workflow(profileIds[0], binding.workflowId!)
    await dialog.getByRole('button', { name: 'Закрыть диалог' }).click()
    await page.locator('.react-flow__node').filter({ hasText: 'Подтверждение в личном чате' }).click()
    await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Подтверждение изменено')
    await page.getByRole('textbox', { name: 'Название', exact: true }).blur()
    await page.getByRole('button', { name: 'Интеграции', exact: true }).click()
    await expect(dialog).toContainText('В Telegram продолжает работать предыдущая версия')
    expect(service.sources.binding(profileIds[0], binding.id).workflowId).toBe(firstPublication.id)
    await dialog.getByRole('button', { name: 'Подтвердить и обновить сценарий чата' }).click()
    await expect(dialog.getByRole('button', { name: 'Эта версия уже активна' })).toBeDisabled()
    const revisedBinding = service.sources.binding(profileIds[0], binding.id)
    expect(revisedBinding.workflowId).not.toBe(firstPublication.id)
    expect(service.sources.workflow(profileIds[0], firstPublication.id).project.nodes.some(node => node.title === 'Подтверждение в личном чате')).toBe(true)
    expect(service.sources.workflow(profileIds[0], revisedBinding.workflowId!).project.nodes.some(node => node.title === 'Подтверждение изменено')).toBe(true)
    await dialog.locator('.telegram-heading').scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'output/verification-0.5.1/telegram-ready.png' })
    await page.setViewportSize({ width: 850, height: 800 })
    await page.screenshot({ path: 'output/verification-0.5.1/telegram-compact.png' })
  } finally { service.stop(); jobs.stop(); await new Promise(resolve => setTimeout(resolve, 30)); await rm(root, { recursive: true, force: true }) }
})
