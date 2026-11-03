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

export type TourRoute = 'result' | 'canvas'
export interface TourStep { target: string; title: string; text: string }
export const tours: Record<TourRoute, { title: string; steps: TourStep[] }> = {
  result: { title: 'Получить результат', steps: [
    { target: 'projects', title: 'Начните со сценария', text: 'Здесь хранятся проекты и готовые примеры. Для текста выберите локальную редакцию SOAR. Проект — редактируемая схема, а каждый запуск — отдельная задача по её снимку.' },
    { target: 'profile', title: 'Проверьте свой профиль', text: 'Модель, подключения и история задач относятся к выбранному профилю. Проекты общие на компьютере. Перед запуском убедитесь, что выбран ваш профиль.' },
    { target: 'ai', title: 'Подключите локальную модель', text: 'В ИИ-помощнике выберите установленную модель Ollama и проверьте подключение. Наличие настройки ещё не означает доступность модели. Эта экскурсия ничего не подключает и не обучает.' },
    { target: 'knowledge', title: 'Выберите источники', text: 'Здесь подключается локальная база и обновляются снимки. В сценарии выберите товары и источники для агента. Импорт фотографии сам по себе не отправляет её модели.' },
    { target: 'run', title: 'Опишите задачу и запустите', text: 'Run открывает ввод задания, историю и состояние выполнения. Проверьте источники перед отправкой. Закрытие панели не отменяет задачу; для отмены используется «Остановить запуск».' },
    { target: 'run', title: 'Проверьте точную версию', text: 'В панели запуска появятся текст, источники, замечания и вопрос Human. Успешная проверка программы не гарантирует достоверности. Подтверждайте только прочитанную версию; после этого сохраните файл. «Доработать этот текст» создаст новую задачу.' },
    { target: 'integrations', title: 'Тот же сценарий через Telegram', text: 'В Интеграциях настройте бота, привяжите свой чат и включите опубликованный сценарий. Правки Canvas не меняют его автоматически. Telegram требует сети; локальный ИИ работает отдельно от этого подключения.' },
  ] },
  canvas: { title: 'Работать со схемой', steps: [
    { target: 'library', title: 'Добавьте первый блок', text: 'Нажмите Concept Node или перетащите его на поле. Concept — свободный замысел: для него не нужны модель, API или технические параметры.' },
    { target: 'canvas', title: 'Расположите и соедините шаги', text: 'Перетаскивайте блоки за карточку. Соедините выходной порт одного блока со входом следующего. Колесо меняет масштаб; миникарта помогает ориентироваться. Для отдельной практики в конце обзора можно создать учебный проект.' },
    { target: 'inspector', title: 'Уточните выбранный элемент', text: 'Выберите блок: справа появятся название, описание и свойства. Когда ничего не выбрано, здесь настройки проекта. Concept можно преобразовать в Agent, Tool или другой тип, сохранив замысел.' },
    { target: 'history', title: 'Исправляйте без страха', text: 'Отмена и повтор относятся к изменениям схемы. Ctrl+Z отменяет последнее редактирование. Они не отменяют уже отправленное сообщение или выполненный внешний запрос.' },
    { target: 'save', title: 'Следите за сохранением', text: '«Сохранено» подтверждает запись проекта. При ошибке не закрывайте приложение: повторите сохранение или скачайте копию. Ввод задания хранится отдельно от проекта.' },
    { target: 'validate', title: 'Проверьте схему', text: 'Validate показывает ошибки и замечания с переходом к элементу. Preview демонстрирует движение по схеме без ИИ-запросов. Run выполняет настроенные операции — это разные действия.' },
    { target: 'export', title: 'Сохраните переносимую копию', text: 'Экспорт создаёт проект или инженерный пакет. Архив проекта не содержит личные подключения, историю задач, базу знаний и фотографии. Для открытия своей копии используйте импорт в окне проектов.' },
  ] },
}

export interface LearningProgress { version: 1; dismissed: boolean; result: number; canvas: number }
export const emptyProgress = (): LearningProgress => ({ version: 1, dismissed: false, result: 0, canvas: 0 })
export function parseProgress(raw: string | null): LearningProgress {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!value || typeof value !== 'object') return emptyProgress()
    const v = value as Record<string, unknown>
    if (v.version !== 1 || typeof v.dismissed !== 'boolean') return emptyProgress()
    for (const route of ['result', 'canvas'] as const) if (typeof v[route] !== 'number' || !Number.isInteger(v[route]) || v[route] < 0 || v[route] > tours[route].steps.length) return emptyProgress()
    return { version: 1, dismissed: v.dismissed, result: v.result as number, canvas: v.canvas as number }
  } catch { return emptyProgress() }
}
