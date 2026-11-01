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

import { _electron as electron, expect, test } from '@playwright/test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { BlindReviewStore } from '../../src/evaluation/blind-review'
import { evaluationKinds, evaluationSuiteSchema } from '../../src/evaluation/schema'
import { contextPacketSchema } from '../../src/knowledge/context'
import { profileIds } from '../../src/profiles/schema'

test('blind comparison uses real IPC, explicit scores and durable profile-bound submission', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-review-desktop-'))
  const store = new BlindReviewStore(join(directory, 'runtime', 'evaluation-reviews'))
  const hashText = (text: string) => createHash('sha256').update(text).digest('hex')
  const hash = (value: unknown) => hashText(JSON.stringify(value))
  const packet = contextPacketSchema.parse({ schemaVersion: '0.5.3', profileId: profileIds[0], runId: randomUUID(), task: 'Сравните тексты', query: 'Подарок', excerpts: [], gaps: [], budgetBytes: 16000 })
  const resultText = '# Выбор подарка\n\nУчитывайте привычки получателя. Это синтетический текст проверки интерфейса.', referenceText = '# Практичный подарок\n\nНачните с размера и привычек. Это синтетический эталон проверки интерфейса.'
  const suite = evaluationSuiteSchema.parse({ schemaVersion: '0.5.5', id: randomUUID(), createdAt: new Date().toISOString(), seeds: [17, 53], raters: profileIds,
    cases: evaluationKinds.flatMap(kind => Array.from({ length: 5 }, (_, i) => ({
      id: randomUUID(), kind, split: i < 3 ? 'development' : 'holdout', prompt: `Тестовое задание ${kind} ${i}: подарок для близкого человека.`,
      ...(kind === 'revision' ? { previousText: 'Исходный текст' } : {}),
      contract: { minimumWords: kind === 'article' ? 600 : 100, minimumSections: kind === 'article' ? 2 : 0, ...(kind === 'short-block' ? { maximumWords: 130 } : {}) },
      packetDigest: hash(packet), reference: { digest: hashText(referenceText), packetDigest: hash(packet), verifiedBy: 'Synthetic fixture', verifiedAt: new Date().toISOString() },
    }))),
  })
  const id = store.create({ suite, packet, resultText, referenceText, raterId: profileIds[0], run: {
    id: randomUUID(), suiteId: suite.id, suiteDigest: hash(suite), caseId: suite.cases[3]!.id, profileDigest: 'a'.repeat(64), packetDigest: hash(packet), seed: 17, status: 'complete', resultDigest: hashText(resultText), formalPassed: true,
  } })
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [resolve('.desktop-app'), `--user-data-dir=${directory}`], env })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('ready')
    await page.getByRole('button', { name: 'ИИ-помощник', exact: true }).click()
    await page.getByRole('button', { name: '05 · Сравнение текстов' }).click()
    await page.getByRole('button', { name: /Пара 1/ }).click()
    await expect(page.getByRole('heading', { name: 'Вариант A' })).toBeVisible()
    expect(await page.locator('.blind-review select').evaluateAll(elements => elements.every(element => (element as HTMLSelectElement).value === ''))).toBe(true)
    await page.screenshot({ path: 'desktop-results/blind-review.png' })
    for (const side of ['A', 'B']) {
      for (const label of ['Точность фактов', 'Полезность', 'Живой язык', 'Структура']) await page.getByLabel(`${side} · ${label}`, { exact: true }).selectOption('7')
      await page.getByLabel(`${side} · Есть неподтверждённые`).selectOption('no')
      await page.getByLabel(`${side} · Готовы принять`).selectOption('yes')
    }
    await page.getByLabel('Какой вариант точнее').selectOption('equal')
    await page.getByLabel('Какой вариант лучше').selectOption('equal')
    await page.getByRole('button', { name: 'Сохранить окончательную оценку' }).click()
    await expect(page.getByText('Эта пара уже оценена.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Сохранить окончательную оценку' })).toBeDisabled()
    expect(store.ratings()).toHaveLength(1)
    const other = await page.evaluate(profileId => window.workflowDesktop!.runtime.request({ kind: 'evaluation-review', command: { action: 'list', profileId } }), profileIds[1])
    expect(other).toEqual([])
    const denied = await page.evaluate(async ({ id, profileId }) => {
      try { await window.workflowDesktop!.runtime.request({ kind: 'evaluation-review', command: { action: 'open', id, profileId } }); return false } catch { return true }
    }, { id, profileId: profileIds[1] })
    expect(denied).toBe(true)
    await page.reload()
    await page.getByRole('button', { name: 'ИИ-помощник', exact: true }).click()
    await page.getByRole('button', { name: '05 · Сравнение текстов' }).click()
    await page.getByRole('button', { name: /Пара 1.*Оценена/ }).click()
    await expect(page.getByRole('button', { name: 'Сохранить окончательную оценку' })).toBeDisabled()
  } finally { await app.close() }
})
