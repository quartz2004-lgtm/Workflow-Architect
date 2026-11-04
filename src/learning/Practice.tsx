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

import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { useProfile } from '../profiles/context'
import type { Autosave } from '../persistence/autosave'
import type { ManagedProjectRepository } from '../persistence/repository'
import { switchProject } from '../persistence/switch-project'
import { openStoredProject } from '../persistence/open-project'
import { lessons, lessonProject } from './lessons'
import { PracticeSpotlight } from './PracticeSpotlight'

interface Session { lessonId: string; projectId: string; originId: string; index: number }
export function Practice({ autosave, repository }: { autosave: Autosave; repository: ManagedProjectRepository }) {
  const editor = useEditor(), profile = useProfile()?.profile
  const key = `workflow-architect:practice:1:${profile?.id ?? 'local'}`
  const [session, setSession] = useState<Session | null>(() => {
    try { const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Session | null; const lesson = lessons.find(l => l.id === v?.lessonId); return v && lesson && typeof v.projectId === 'string' && typeof v.originId === 'string' && Number.isInteger(v.index) && v.index >= 0 && v.index <= lesson.steps.length ? v : null } catch { return null }
  })
  const request = useStore(editor.uiStore, s => s.practiceLesson)
  const project = useStore(editor.projectStore, s => s.project)
  const selected = useStore(editor.selectionStore, s => s.nodeIds)
  const graphId = useStore(editor.navigationStore, s => s.graphId)
  const history = useStore(editor.historyStore)
  const run = useStore(editor.runtime.store)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [hint, setHint] = useState(false)
  const started = useRef<string | null>(null)
  const persist = (value: Session | null) => {
    setSession(value)
    try {
      if (value) {
        localStorage.setItem(key, JSON.stringify(value))
        if (value.index === lessons.find(l => l.id === value.lessonId)?.steps.length) {
          let previous: unknown
          try { previous = JSON.parse(localStorage.getItem(`${key}:completed`) ?? '[]') } catch { previous = [] }
          const ids = Array.isArray(previous) ? previous.filter(id => typeof id === 'string' && lessons.some(l => l.id === id)) : []
          localStorage.setItem(`${key}:completed`, JSON.stringify([...new Set([...ids, value.lessonId])]))
        }
      } else localStorage.removeItem(key)
    }
    catch { setError('Не удалось сохранить место урока. Продолжить можно сейчас, но после перезапуска потребуется начать заново.') }
  }
  useEffect(() => {
    if (!request || started.current) return
    started.current = request
    const lesson = lessons.find(l => l.id === request)
    if (!lesson) return
    if (['running', 'waiting', 'queued'].includes(editor.runtime.store.getState().status)) {
      setError('Сначала завершите или остановите текущий запуск, затем откройте урок.'); editor.uiStore.setState({ practiceLesson: null }); started.current = null; return
    }
    setBusy(true); setError('')
    const originId = session?.projectId === editor.projectStore.getState().project.project.id ? session.originId : editor.projectStore.getState().project.project.id
    const next = lessonProject(lesson)
    void switchProject(editor, autosave, next).then(() => {
      persist({ lessonId: lesson.id, projectId: next.project.id, originId, index: 0 })
      setHint(false); editor.uiStore.setState({ learning: false }); editor.canvasStore.setState({ action: 'fit-project' })
    }).catch(error => setError(error instanceof Error ? error.message : String(error))).finally(() => { setBusy(false); editor.uiStore.setState({ practiceLesson: null }); started.current = null })
  // A request is an explicit start/restart action, not a response to project changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])
  const lesson = lessons.find(l => l.id === session?.lessonId)
  const active = !!session && project.project.id === session.projectId
  const step = session && lesson?.steps[session.index]
  const satisfied = active && !!step && step.done({ project, selected, graphId, undoCount: history.past.length, redoCount: history.future.length, run })
  useEffect(() => { if (satisfied && session) { persist({ ...session, index: session.index + 1 }); setHint(false) } }, [satisfied, session]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active || !step) return
    const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
    target?.setAttribute('data-practice-focus', 'true')
    return () => { target?.removeAttribute('data-practice-focus') }
  }, [active, step])
  const openProject = async (id: string, end = false) => {
    setBusy(true); setError('')
    try { const raw = await repository.load(id); if (raw === undefined) throw new Error('Проект урока не найден. Начните урок заново из обучения.'); await switchProject(editor, autosave, await openStoredProject(raw)); if (end) persist(null) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  if (!session && !error && !busy) return null
  return <aside className="practice-coach" aria-label="Практический урок">
    {active && step && <PracticeSpotlight target={step.target} />}
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Сохраняем проект и открываем урок…</p>}
    {session && lesson && <>
      <div><span className="eyebrow">{lesson.level} · {Math.min(session.index + 1, lesson.steps.length)} / {lesson.steps.length}</span><strong>{lesson.title}</strong></div>
      {!active ? <><p>Урок сохранён. Вернитесь в учебный проект, чтобы продолжить с текущего шага.</p><button disabled={busy} onClick={() => void openProject(session.projectId)}>Продолжить практический урок</button></> : step ? <>
        <h2>{step.title}</h2><p>{step.text}</p><button aria-expanded={hint} onClick={() => setHint(!hint)}>Нужна подсказка</button>{hint && <p className="practice-hint">{step.hint}</p>}
      </> : <><h2>Урок выполнен</h2><p>Вы выполнили все действия этого урока. Учебная схема сохранена и доступна в проектах.</p><button onClick={() => editor.uiStore.setState({ learning: true })}>Выбрать следующий урок</button></>}
      <button disabled={busy} onClick={() => void openProject(session.originId)}>Вернуться к рабочему проекту</button>
      <button disabled={busy} onClick={() => editor.uiStore.setState({ practiceLesson: lesson.id })}>Начать урок заново</button>
      <button disabled={busy} onClick={() => persist(null)}>Завершить занятие</button>
    </>}
  </aside>
}
