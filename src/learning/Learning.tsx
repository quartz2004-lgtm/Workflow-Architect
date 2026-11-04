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

import { useState } from 'react'
import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { useProfile } from '../profiles/context'
import { Modal } from '../shared/Modal'
import type { Autosave } from '../persistence/autosave'
import type { ManagedProjectRepository } from '../persistence/repository'
import { switchProject } from '../persistence/switch-project'
import { openStoredProject } from '../persistence/open-project'
import { createProject } from '../domain/factories'
import { emptyProgress, parseProgress, tours, type LearningProgress, type TourRoute } from './tours'
import { TourOverlay } from './TourOverlay'
import { Practice } from './Practice'
import { lessons } from './lessons'
import './learning.css'

export function Learning({ autosave, repository }: { autosave: Autosave; repository: ManagedProjectRepository }) {
  const editor = useEditor(), profile = useProfile()?.profile
  const key = `workflow-architect:learning:1:${profile?.id ?? 'local'}`
  const [progress, setProgress] = useState(() => { try { return parseProgress(localStorage.getItem(key)) } catch { return emptyProgress() } })
  const [route, setRoute] = useState<TourRoute | null>(null), [index, setIndex] = useState(0), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), [practice, setPractice] = useState<{ id: string; origin: string } | null>(null)
  const open = useStore(editor.uiStore, state => state.learning)
  const practicePending = useStore(editor.uiStore, state => state.practiceLesson)
  const currentId = useStore(editor.projectStore, state => state.project.project.id)
  let completed: string[] = []
  try { const value: unknown = JSON.parse(localStorage.getItem(`workflow-architect:practice:1:${profile?.id ?? 'local'}:completed`) ?? '[]'); if (Array.isArray(value)) completed = value.filter((id): id is string => typeof id === 'string' && lessons.some(l => l.id === id)) } catch { /* Progress is optional; lessons remain available. */ }
  const save = (next: LearningProgress) => {
    setProgress(next)
    try { localStorage.setItem(key, JSON.stringify(next)); setError('') }
    catch { setError('Не удалось сохранить прогресс знакомства. Обзор доступен сейчас; после перезапуска предложение может появиться снова.') }
  }
  const start = (next: TourRoute, restart = false) => {
    setIndex(restart || progress[next] >= tours[next].steps.length ? 0 : progress[next])
    setRoute(next); save({ ...progress, dismissed: true }); editor.uiStore.setState({ learning: false })
  }
  const move = (next: number) => { setIndex(next); save({ ...progress, [route!]: next }) }
  const close = () => { setRoute(null); editor.uiStore.setState({ learning: false }) }
  const finish = () => { save({ ...progress, [route!]: tours[route!].steps.length }); setRoute(null); editor.uiStore.setState({ learning: true }) }
  const beginPractice = async () => {
    setBusy(true); setError('')
    try {
      const origin = editor.projectStore.getState().project.project.id
      const project = createProject('Учебный проект · знакомство с Canvas')
      project.project.description = 'Учебная схема. Добавьте Concept, переименуйте, соедините два блока, попробуйте Undo и экспорт. Здесь нет настроенных внешних действий.'
      await switchProject(editor, autosave, project)
      setPractice({ id: project.project.id, origin }); editor.uiStore.setState({ learning: false }); editor.canvasStore.setState({ action: 'fit-project' })
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const returnToProject = async () => {
    if (!practice) return
    setBusy(true); setError('')
    try {
      const raw = await repository.load(practice.origin)
      if (raw === undefined) throw new Error('Исходный проект не найден. Откройте нужный через окно проектов; учебная работа сохранена.')
      await switchProject(editor, autosave, await openStoredProject(raw)); setPractice(null)
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <>
    <Practice autosave={autosave} repository={repository} />
    {!progress.dismissed && !route && <aside className="learning-banner" aria-label="Знакомство с приложением"><div><strong>Освоимся вместе?</strong><span>Практические уроки: выполняйте действия на схеме и получайте следующий шаг.</span></div><button onClick={() => editor.uiStore.setState({ learning: true })}>Пройти знакомство</button><button onClick={() => save({ ...progress, dismissed: true })}>Пропустить знакомство</button></aside>}
    {practice?.id === currentId && <aside className="learning-banner" aria-label="Учебный проект"><div><strong>Отдельный учебный проект</strong><span>Добавьте блок, задайте имя, соедините два шага и попробуйте экспорт. Работа сохраняется как обычный проект.</span></div><button disabled={busy} onClick={() => void returnToProject()}>Вернуться к рабочему проекту</button><button onClick={() => start('canvas', true)}>Подсказки по схеме</button></aside>}
    {error && !open && <p className="learning-error" role="alert">{error}</p>}
    {open && !route && <Modal title="Обучение работе с приложением" close={() => { if (!busy) editor.uiStore.setState({ learning: false }) }}>
      <p>Практические уроки проходят в отдельных учебных проектах. Выполняйте задание на настоящем Canvas: следующий шаг появится после нужного действия. Текущий проект сохраняется перед началом.</p>
      <p>Выполнено уроков: {completed.length} из {lessons.length}. Можно повторять уроки и выбирать нужную тему.</p>
      <div className="lesson-catalog">{[...new Set(lessons.map(l => l.level))].map((level, i) => <details key={level} open={i === 0}><summary>{level}</summary>{lessons.filter(l => l.level === level).map(lesson => <article key={lesson.id}><h4>{lesson.title}{completed.includes(lesson.id) ? ' · Выполнено' : ''}</h4><p>{lesson.purpose}</p><button disabled={!!practicePending} onClick={() => { save({ ...progress, dismissed: true }); editor.uiStore.setState({ practiceLesson: lesson.id }) }}>Начать урок · {lesson.title}</button><small>Практических шагов: {lesson.steps.length}</small></article>)}</details>)}</div>
      <h3>Короткие обзоры интерфейса</h3><p>Обзоры объясняют расположение разделов. Практические действия изучаются в уроках выше.</p>
      <div className="learning-routes">{(['result', 'canvas'] as const).map(value => <section key={value}><h3>{tours[value].title}</h3><p>{value === 'result' ? 'Сценарий → задание → проверка → ваш файл.' : 'Блоки → связи → свойства → сохранение и экспорт.'}</p><p className="muted">{progress[value] >= tours[value].steps.length ? 'Обзор завершён. Это не оценка навыков.' : progress[value] ? `Продолжить с шага ${progress[value] + 1} из ${tours[value].steps.length}` : `${tours[value].steps.length} коротких шагов`}</p><button disabled={busy} onClick={() => start(value)}>{progress[value] >= tours[value].steps.length ? 'Повторить' : progress[value] ? 'Продолжить' : 'Начать'} · {tours[value].title}</button>{progress[value] > 0 && progress[value] < tours[value].steps.length && <button disabled={busy} onClick={() => start(value, true)}>Сначала · {tours[value].title}</button>}</section>)}</div>
      <section className="learning-practice"><h3>Практика без изменения рабочего проекта</h3><p>Сначала сохраним текущую работу, затем откроем отдельную пустую учебную схему. Вы сможете вернуться назад; учебный проект останется в списке проектов.</p><button disabled={busy} onClick={() => void beginPractice()}>{busy ? 'Сохраняем и открываем…' : 'Открыть учебный проект'}</button></section>
      {error && <p role="alert" className="field-error">{error}</p>}
      <p className="muted">Esc завершает обзор позже. Возобновить его можно через «Обучение» рядом с альманахом. Прогресс хранится отдельно для каждого профиля.</p>
    </Modal>}
    {route && <TourOverlay key={route} title={tours[route].title} steps={tours[route].steps} index={index} move={move} close={close} finish={finish} />}
  </>
}
