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

import type { Project, WorkflowNode } from '../domain/schema'
import { createProject } from '../domain/factories'
import { createExecutionExample } from '../execution/example'
import type { RunViewState } from '../execution/view-state'

export interface LessonState { project: Project; selected: string[]; graphId?: string | null; undoCount: number; redoCount: number; run: RunViewState }
export interface LessonStep { title: string; text: string; hint: string; target: string; done: (state: LessonState) => boolean }
export interface Lesson { id: string; level: string; title: string; purpose: string; seed?: 'execution'; steps: LessonStep[] }
const node = (s: LessonState, type: WorkflowNode['type']) => s.project.nodes.find(n => n.type === type)
const add = (type: WorkflowNode['type'], label: string): LessonStep => ({ title: `Добавьте ${label}`, text: `Перетащите ${label} из библиотеки на рабочее поле или нажмите его в библиотеке.`, hint: 'Библиотека находится слева. Добавьте именно указанный тип блока; другие блоки можно оставить.', target: 'library', done: s => !!node(s, type) })
const configure = (title: string, text: string, done: LessonStep['done']): LessonStep => ({ title, text, hint: 'Выберите нужный блок. Справа раскройте соответствующий раздел. После ввода нажмите Tab или щёлкните вне поля, чтобы сохранить значение.', target: 'inspector', done })
export const lessons: Lesson[] = [
  { id: 'concept', level: '1 · Основы Canvas', title: '1.1 · Создать и назвать идею', purpose: 'Добавьте блок, выберите его и оформите понятное назначение.', steps: [add('concept', 'Concept Node'),
    configure('Назовите идею', 'Выберите Concept. В разделе «Идентификация» задайте название «Моя первая идея».', s => node(s, 'concept')?.title === 'Моя первая идея'),
    configure('Опишите результат', 'В описании этого блока напишите, что хотите получить: хотя бы одно предложение из 20 символов.', s => (node(s, 'concept')?.description.trim().length ?? 0) >= 20),
  ] },
  { id: 'connections', level: '1 · Основы Canvas', title: '1.2 · Связать два шага', purpose: 'Соберите направленную связь от события к результату.', steps: [add('trigger', 'Trigger'), add('artifact', 'Artifact'),
    { title: 'Соедините вход с результатом', text: 'Соедините выход Trigger со входом Artifact: перетаскиванием порта или последовательными щелчками по двум портам.', hint: 'Выход находится справа карточки, вход — слева. Направление важно: от Trigger к Artifact. Неверную связь можно выделить и удалить.', target: 'canvas', done: s => s.project.edges.some(e => e.type === 'flow' && e.sourceNode === node(s, 'trigger')?.id && e.targetNode === node(s, 'artifact')?.id && !!e.sourcePort && !!e.targetPort) },
  ] },
  { id: 'history', level: '1 · Основы Canvas', title: '1.3 · Отмена и повтор', purpose: 'Научитесь безопасно исправлять изменения схемы.', steps: [add('concept', 'Concept Node'),
    { title: 'Отмените добавление', text: 'Нажмите Ctrl+Z или кнопку «Отменить» сверху. Добавленный Concept должен исчезнуть.', hint: 'Сначала выйдите из текстового поля щелчком по Canvas. Здесь отменяется изменение схемы, а не текст в поле.', target: 'history', done: s => !node(s, 'concept') && s.redoCount > 0 },
    { title: 'Верните блок', text: 'Нажмите Ctrl+Shift+Z или «Повторить». Верните Concept на схему.', hint: 'Кнопка повтора находится рядом с отменой. Новое редактирование очищает историю повтора; тогда начните урок заново.', target: 'history', done: s => !!node(s, 'concept') && s.redoCount === 0 },
  ] },
  { id: 'agent', level: '2 · Конфигурация блоков', title: '2.1 · Agent: роль и инструкции', purpose: 'Разделите ответственность агента и требования к его ответу.', steps: [add('agent', 'Agent'),
    configure('Задайте роль', 'В разделе «Роль и инструкции» заполните «Роль»: «Редактор статей». Роль объясняет, за что отвечает агент.', s => { const n = node(s, 'agent'); return n?.type === 'agent' && n.config.role === 'Редактор статей' }),
    configure('Напишите инструкцию', 'В System prompt задайте своими словами требования к работе редактора: не менее 40 символов. Например, попросите сохранить факты и улучшить ясность текста.', s => { const n = node(s, 'agent'); return n?.type === 'agent' && (n.config.systemPrompt?.trim().length ?? 0) >= 40 }),
  ] },
  { id: 'trigger', level: '2 · Конфигурация блоков', title: '2.2 · Trigger: ручной вход', purpose: 'Отличите описание события от исполняемой операции.', steps: [add('trigger', 'Trigger'),
    configure('Настройте ручное событие', 'В настройках Trigger выберите тип manual. Этот вход получает задание от человека в приложении.', s => { const n = node(s, 'trigger'); return n?.type === 'trigger' && n.config.triggerType === 'manual' }),
    configure('Включите ручную операцию', 'В разделе «Выполнение» выберите операцию «Ручной вход». Одного описания типа события недостаточно для запуска.', s => node(s, 'trigger')?.operation?.kind === 'manual'),
  ] },
  { id: 'tool', level: '2 · Конфигурация блоков', title: '2.3 · Tool: назначение и действие', purpose: 'Опишите инструмент и выберите встроенную операцию без внешних сервисов.', steps: [add('tool', 'Tool'),
    configure('Опишите инструмент', 'В разделе «Инструмент» укажите Provider: builtin. Это описание встроенного поставщика.', s => { const n = node(s, 'tool'); return n?.type === 'tool' && n.config.provider === 'builtin' }),
    configure('Выберите действие', 'В «Выполнение» выберите операцию проверки текста. Она считает слова и структуру; факты текста не проверяет.', s => node(s, 'tool')?.operation?.kind === 'text-statistics'),
  ] },
  { id: 'data', level: '2 · Конфигурация блоков', title: '2.4 · Data: данные и преобразование', purpose: 'Различите хранимые данные и действие над ними.', steps: [add('data', 'Data'),
    configure('Выберите тип данных', 'В разделе данных выберите тип json — структурированные данные.', s => { const n = node(s, 'data'); return n?.type === 'data' && n.config.dataType === 'json' }),
    configure('Настройте преобразование', 'В «Выполнение» выберите преобразование полей (map), добавьте выходное поле и назовите его result.', s => { const op = node(s, 'data')?.operation; return op?.kind === 'map' && op.fields.some(f => f.key === 'result') }),
  ] },
  { id: 'human', level: '2 · Конфигурация блоков', title: '2.5 · Human: решение человека', purpose: 'Настройте остановку выполнения для осмысленного подтверждения.', steps: [add('human', 'Human'),
    configure('Опишите проверку', 'В инструкции Human напишите, что должен проверить человек перед подтверждением: не менее 20 символов.', s => { const n = node(s, 'human'); return n?.type === 'human' && (n.config.instruction?.trim().length ?? 0) >= 20 }),
    configure('Настройте вопрос выполнения', 'В «Выполнение» выберите Human и задайте вопрос «Сохранить результат?». Именно этот вопрос появится при запуске.', s => { const op = node(s, 'human')?.operation; return op?.kind === 'human' && op.question === 'Сохранить результат?' }),
  ] },
  { id: 'artifact', level: '2 · Конфигурация блоков', title: '2.6 · Artifact: готовый файл', purpose: 'Задайте результат и имя создаваемого файла.', steps: [add('artifact', 'Artifact'),
    configure('Опишите формат', 'В разделе артефакта задайте формат JSON. Это описание ожидаемого результата.', s => { const n = node(s, 'artifact'); return n?.type === 'artifact' && n.config.format?.toLowerCase() === 'json' }),
    configure('Назовите файл', 'В «Выполнение» выберите сохранение артефакта и задайте имя learning.json.', s => { const op = node(s, 'artifact')?.operation; return op?.kind === 'artifact' && op.filename === 'learning.json' }),
  ] },
  { id: 'logic', level: '3 · Управление процессом', title: '3.1 · Logic: условие и ветви', purpose: 'Настройте операцию условного перехода и увидьте её выходы.', steps: [add('logic', 'Logic'),
    configure('Выберите условие', 'В «Выполнение» выберите If. Появятся две ветви: условие выполнено и не выполнено.', s => node(s, 'logic')?.operation?.kind === 'if'),
    configure('Укажите, что проверять', 'Источник значения — «Вход Flow». В поле «Путь к полю» укажите /approved, а в «Проверка» — «Равно true». Так ветвление проверит ответ «да», переданный предыдущим шагом.', s => { const op = node(s, 'logic')?.operation; return op?.kind === 'if' && op.predicate.source.kind === 'input' && op.predicate.source.pointer === '/approved' && op.predicate.operator === 'is-true' }),
    add('artifact', 'Artifact'),
    { title: 'Подключите результат ветви', text: 'Соедините один из выходов Logic со входом Artifact. Это путь, по которому пойдёт выполнение при соответствующем результате условия.', hint: 'Выберите выходной порт Logic и входной порт Artifact. Для полноценного сценария потребуется обработать и другую ветвь.', target: 'canvas', done: s => s.project.edges.some(e => e.type === 'flow' && e.sourceNode === node(s, 'logic')?.id && e.targetNode === node(s, 'artifact')?.id && !!e.sourcePort) },
  ] },
  { id: 'subworkflow', level: '3 · Управление процессом', title: '3.2 · Subworkflow: вложенная схема', purpose: 'Откройте внутренний процесс и свяжите его порты с внешним блоком.', steps: [add('subworkflow', 'Subworkflow'),
    { title: 'Войдите во вложенную схему', text: 'Выберите Subworkflow. В Inspector нажмите «Открыть внутренний Canvas».', hint: 'Кнопка расположена в разделе «Открытые входы и выходы».', target: 'inspector', done: s => { const n = node(s, 'subworkflow'); return n?.type === 'subworkflow' && !!s.graphId && s.graphId === n.config.subworkflowId } },
    { title: 'Добавьте внутренний шаг', text: 'Во внутренней схеме добавьте Data из библиотеки. Затем вернитесь в корневой проект через строку навигации над Canvas.', hint: 'Внутренняя схема имеет отдельные узлы. Для возврата нажмите название проекта в строке навигации.', target: 'library', done: s => !s.graphId && s.project.subworkflows.some(g => g.nodes.some(n => n.type === 'data')) },
    configure('Свяжите открытые порты', 'Выберите внешний Subworkflow. В «Открытые входы и выходы» свяжите input с входом внутреннего Data, а output — с его выходом.', s => { const n = node(s, 'subworkflow'); if (n?.type !== 'subworkflow') return false; const graph = s.project.subworkflows.find(g => g.id === n.config.subworkflowId); return n.ports.length >= 2 && n.ports.every(p => graph?.nodes.some(child => child.type === 'data' && child.id === p.binding?.nodeId && child.ports.some(inner => inner.id === p.binding?.portId && inner.direction === p.direction && inner.kind === p.kind))) }),
  ] },
  { id: 'run', level: '4 · Выполнение и результат', title: '4.1 · Запустить и подтвердить', purpose: 'Пройдите настоящий локальный запуск без модели и интернета.', seed: 'execution', steps: [
    { title: 'Запустите учебную схему', text: 'Откройте Run. Выберите «Обработать текст — Да», введите любое предложение и запустите workflow.', hint: 'Если форма не видна, нажмите «Новый запуск». Ответьте на обязательное поле и заполните текст. Ожидаем, пока схема дойдёт до вопроса Human.', target: 'run', done: s => s.run.snapshot?.project.id === s.project.project.id && s.run.status === 'waiting' },
    { title: 'Подтвердите результат', text: 'В панели выполнения найдите вопрос человека и нажмите «Подтвердить». Дождитесь появления result.json.', hint: 'В этом уроке используются только встроенные преобразования. Если отменили запуск, начните его снова; шаг ждёт успешного результата этой учебной схемы.', target: 'run', done: s => s.run.snapshot?.project.id === s.project.project.id && s.run.status === 'succeeded' && s.run.artifacts.some(a => a.filename === 'result.json') },
  ] },
]
export function lessonProject(lesson: Lesson): Project {
  const project = lesson.seed === 'execution' ? createExecutionExample() : createProject()
  project.project.name = `Учебный · ${lesson.title}`
  return project
}
