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

test('two profiles keep separate practical sessions and completion records', async ({ page }) => {
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.getByRole('button', { name: 'Начать урок · 1.1 · Создать и назвать идею', exact: true }).click()
  const coach = page.getByRole('complementary', { name: 'Практический урок' })
  await expect(coach).toContainText('Добавьте Concept Node')
  await page.locator('.library').getByRole('button', { name: /Concept Node/ }).click()
  await expect(coach).toContainText('Назовите идею')
  await page.getByRole('button', { name: /^Профили:/ }).click()
  await page.getByRole('button', { name: 'Профиль 2 · переключиться', exact: true }).click()
  await page.getByRole('button', { name: 'Пропустить настройку', exact: true }).click()
  await expect(coach).toHaveCount(0)
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await expect(page.getByText('Выполнено уроков: 0 из 12. Можно повторять уроки и выбирать нужную тему.')).toBeVisible()
  await page.getByRole('button', { name: 'Начать урок · 1.3 · Отмена и повтор', exact: true }).click()
  await expect(coach).toContainText('Добавьте Concept Node')
  await page.locator('.library').getByRole('button', { name: /Concept Node/ }).click()
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(coach.getByRole('heading', { name: 'Урок выполнен' })).toBeVisible()
  await page.getByRole('button', { name: /^Профили:/ }).click()
  await page.getByRole('button', { name: 'Профиль 1 · переключиться', exact: true }).click()
  await expect(coach.getByRole('heading', { name: 'Назовите идею' })).toBeVisible()
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await expect(page.getByText('Выполнено уроков: 0 из 12. Можно повторять уроки и выбирать нужную тему.')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Профили:/ }).click()
  await page.getByRole('button', { name: 'Профиль 2 · переключиться', exact: true }).click()
  await expect(coach.getByRole('heading', { name: 'Урок выполнен' })).toBeVisible()
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await expect(page.getByText('Выполнено уроков: 1 из 12. Можно повторять уроки и выбирать нужную тему.')).toBeVisible()
})

test('connection lesson requires a real directed edge', async ({ page }) => {
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.getByRole('button', { name: 'Начать урок · 1.2 · Связать два шага', exact: true }).click()
  const coach = page.getByRole('complementary', { name: 'Практический урок' })
  await expect(coach).toContainText('Добавьте Trigger')
  await page.locator('.library').getByRole('button', { name: /Trigger/ }).click()
  await page.locator('.library').getByRole('button', { name: /Artifact/ }).click()
  await expect(coach).toContainText('Соедините вход с результатом')
  const nodes = page.locator('.react-flow__node')
  await nodes.filter({ hasText: 'trigger' }).locator('.source').dragTo(nodes.filter({ hasText: 'artifact' }).locator('.target'))
  await expect(coach.getByRole('heading', { name: 'Урок выполнен' })).toBeVisible()
})

test('history lesson observes undo and redo', async ({ page }) => {
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.getByRole('button', { name: 'Начать урок · 1.3 · Отмена и повтор', exact: true }).click()
  const coach = page.getByRole('complementary', { name: 'Практический урок' })
  await expect(coach).toContainText('Добавьте Concept Node')
  await page.locator('.library').getByRole('button', { name: /Concept Node/ }).click()
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(coach).toContainText('Верните блок')
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(coach.getByRole('heading', { name: 'Урок выполнен' })).toBeVisible()
})

test('subworkflow lesson checks inner graph and actual port bindings', async ({ page }) => {
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.locator('.lesson-catalog summary').filter({ hasText: '3 · Управление процессом' }).click()
  await page.getByRole('button', { name: 'Начать урок · 3.2 · Subworkflow: вложенная схема', exact: true }).click()
  const coach = page.getByRole('complementary', { name: 'Практический урок' })
  await expect(coach).toContainText('Добавьте Subworkflow')
  await page.locator('.library').getByRole('button', { name: /Subworkflow/ }).click()
  await page.getByRole('button', { name: 'Открыть внутренний Canvas', exact: true }).click()
  await expect(coach).toContainText('Добавьте внутренний шаг')
  await page.locator('.library').getByRole('button', { name: /Data/ }).click()
  await page.getByRole('navigation', { name: 'Путь workflow' }).getByRole('button').first().click()
  await page.locator('.react-flow__node').click()
  await page.getByRole('combobox', { name: 'input · input', exact: true }).selectOption({ label: 'data → input' })
  await expect(coach).toContainText('Свяжите открытые порты')
  await page.getByRole('combobox', { name: 'output · output', exact: true }).selectOption({ label: 'data → output' })
  await expect(coach.getByRole('heading', { name: 'Урок выполнен' })).toBeVisible()
})

test('logic lesson teaches a predicate and its output', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.locator('.lesson-catalog summary').filter({ hasText: '3 · Управление процессом' }).click()
  await page.getByRole('button', { name: 'Начать урок · 3.1 · Logic: условие и ветви', exact: true }).click()
  const coach = page.getByRole('complementary', { name: 'Практический урок' })
  await expect(coach).toContainText('Добавьте Logic')
  await page.locator('.library').getByRole('button', { name: /Logic/ }).click()
  await page.getByRole('combobox', { name: 'Операция', exact: true }).selectOption('if')
  await page.getByRole('textbox', { name: 'Путь к полю', exact: true }).fill('/approved')
  await page.getByRole('textbox', { name: 'Путь к полю', exact: true }).press('Tab')
  await expect(coach).toContainText('Добавьте Artifact')
  await page.screenshot({ path: 'output/verification-0.5.6/practice-active.png' })
  await page.locator('.library').getByRole('button', { name: /Artifact/ }).click()
  const nodes = page.locator('.react-flow__node')
  await nodes.filter({ hasText: 'logic' }).locator('.source').first().dragTo(nodes.filter({ hasText: 'artifact' }).locator('.target'))
  await expect(coach.getByRole('heading', { name: 'Урок выполнен' })).toBeVisible()
})

for (const lesson of [
  { title: '2.2 · Trigger: ручной вход', type: 'Trigger', section: 'Триггер', field: 'Trigger type', value: 'manual', select: true, operation: 'manual' },
  { title: '2.3 · Tool: назначение и действие', type: 'Tool', section: 'Инструмент', field: 'Provider', value: 'builtin', operation: 'text-statistics' },
  { title: '2.4 · Data: данные и преобразование', type: 'Data', section: 'Данные', field: 'Data type', value: 'json', select: true, operation: 'map' },
  { title: '2.5 · Human: решение человека', type: 'Human', section: 'Участие человека', field: 'Вопрос / инструкция', value: 'Проверьте корректность результата перед его сохранением.', operation: 'human' },
  { title: '2.6 · Artifact: готовый файл', type: 'Artifact', section: 'Результат', field: 'Формат', value: 'JSON', operation: 'artifact' },
]) test(`configuration practice: ${lesson.type}`, async ({ page }) => {
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.locator('.lesson-catalog summary').filter({ hasText: '2 · Конфигурация блоков' }).click()
  await page.getByRole('button', { name: `Начать урок · ${lesson.title}`, exact: true }).click()
  const coach = page.getByRole('complementary', { name: 'Практический урок' })
  await expect(coach).toContainText(`Добавьте ${lesson.type}`)
  await page.locator('.library').getByRole('button', { name: new RegExp(`^${lesson.type}| ${lesson.type}`) }).click()
  const field = page.getByRole(lesson.select ? 'combobox' : 'textbox', { name: lesson.field, exact: true })
  if (!await field.isVisible()) await page.locator('.inspector summary').getByText(lesson.section, { exact: true }).click()
  if (lesson.select) await field.selectOption(lesson.value)
  else { await field.fill(lesson.value); await field.press('Tab') }
  await page.getByRole('combobox', { name: 'Операция', exact: true }).selectOption(lesson.operation)
  if (lesson.type === 'Data') {
    await page.getByRole('button', { name: '＋ Выходное поле' }).click()
    await page.getByRole('textbox', { name: 'Имя выходного поля', exact: true }).fill('result')
    await page.getByRole('textbox', { name: 'Имя выходного поля', exact: true }).press('Tab')
  }
  if (lesson.type === 'Human' || lesson.type === 'Artifact') {
    const field = page.getByRole('textbox', { name: lesson.type === 'Human' ? 'Вопрос человеку' : 'Имя файла', exact: true })
    await field.fill(lesson.type === 'Human' ? 'Сохранить результат?' : 'learning.json'); await field.press('Tab')
  }
  await expect(coach.getByRole('heading', { name: 'Урок выполнен' })).toBeVisible()
})

test('agent configuration lesson follows committed fields and records completion', async ({ page }) => {
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.locator('.lesson-catalog summary').filter({ hasText: '2 · Конфигурация блоков' }).click()
  await page.getByRole('button', { name: 'Начать урок · 2.1 · Agent: роль и инструкции', exact: true }).click()
  const coach = page.getByRole('complementary', { name: 'Практический урок' })
  await expect(coach.getByRole('heading', { name: 'Добавьте Agent' })).toBeVisible()
  await page.locator('.library').getByRole('button', { name: /Agent/ }).click()
  await expect(coach.getByRole('heading', { name: 'Задайте роль' })).toBeVisible()
  const role = page.getByRole('textbox', { name: 'Роль', exact: true })
  if (!await role.isVisible()) await page.locator('.inspector summary').filter({ hasText: 'Роль и инструкции' }).click()
  await role.fill('Редактор статей'); await role.press('Tab')
  await expect(coach.getByRole('heading', { name: 'Напишите инструкцию' })).toBeVisible()
  await page.getByRole('textbox', { name: 'System prompt', exact: true }).fill('Сохраняй проверенные факты и улучшай ясность текста для читателя, не добавляя вымышленных обещаний.')
  await page.getByRole('textbox', { name: 'System prompt', exact: true }).press('Tab')
  await expect(coach.getByRole('heading', { name: 'Урок выполнен' })).toBeVisible()
  await coach.getByRole('button', { name: 'Выбрать следующий урок' }).click()
  await expect(page.getByText('Выполнено уроков: 1 из 12. Можно повторять уроки и выбирать нужную тему.')).toBeVisible()
})

test('execution lesson waits for actual Human and an artifact from its own project', async ({ page }) => {
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.locator('.lesson-catalog summary').filter({ hasText: '4 · Выполнение и результат' }).click()
  await page.getByRole('button', { name: 'Начать урок · 4.1 · Запустить и подтвердить', exact: true }).click()
  const coach = page.getByRole('complementary', { name: 'Практический урок' })
  await expect(coach.getByRole('heading', { name: 'Запустите учебную схему' })).toBeVisible()
  await page.getByRole('button', { name: /^Run ·/ }).click()
  const panel = page.getByRole('region', { name: 'Локальное выполнение', exact: true })
  await panel.getByRole('combobox', { name: /Обработать текст/ }).selectOption('true')
  await panel.getByRole('textbox', { name: /Ваш текст/ }).fill('Учусь запускать сценарий')
  await panel.getByRole('button', { name: 'Запустить workflow', exact: true }).click()
  await expect(coach.getByRole('heading', { name: 'Подтвердите результат' })).toBeVisible()
  await panel.getByRole('button', { name: 'Подтвердить', exact: true }).click()
  await expect(coach.getByRole('heading', { name: 'Урок выполнен' })).toBeVisible()
})

test('practical lesson waits for the right action, resumes and protects the working project', async ({ page }) => {
  await page.getByRole('button', { name: 'Обучение', exact: true }).click()
  await page.getByRole('button', { name: 'Начать урок · 1.1 · Создать и назвать идею', exact: true }).click()
  const coach = page.getByRole('complementary', { name: 'Практический урок' })
  await expect(coach.getByRole('heading', { name: 'Добавьте Concept Node' })).toBeVisible()
  await page.locator('.library').getByRole('button', { name: /Agent/ }).click()
  await expect(coach.getByRole('heading', { name: 'Добавьте Concept Node' })).toBeVisible()
  await page.locator('.library').getByRole('button', { name: /Concept Node/ }).click()
  await expect(coach.getByRole('heading', { name: 'Назовите идею' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Не то название')
  await page.getByRole('textbox', { name: 'Название', exact: true }).press('Tab')
  await expect(coach.getByRole('heading', { name: 'Назовите идею' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Моя первая идея')
  await page.getByRole('textbox', { name: 'Название', exact: true }).press('Tab')
  await expect(coach.getByRole('heading', { name: 'Опишите результат' })).toBeVisible()
  await expect(page.locator('.save-status')).toContainText('Сохранено')
  await page.reload()
  await expect(coach.getByRole('heading', { name: 'Опишите результат' })).toBeVisible()
  await page.locator('.react-flow__node').filter({ hasText: 'Моя первая идея' }).click()
  await page.getByRole('textbox', { name: 'Описание', exact: true }).fill('Подготовить понятный текст для покупателей магазина.')
  await page.getByRole('textbox', { name: 'Описание', exact: true }).press('Tab')
  await expect(coach.getByRole('heading', { name: 'Урок выполнен' })).toBeVisible()
  await page.screenshot({ path: 'output/verification-0.5.6/practice-complete.png' })
  await coach.getByRole('button', { name: 'Вернуться к рабочему проекту' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
})
