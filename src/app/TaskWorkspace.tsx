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
import { useEditor } from './context'
import { useProfile } from '../profiles/context'
import { ModelReadiness } from '../ai/ModelReadiness'
import { EditorialStarter } from '../editorial/EditorialStarter'
import { switchProject } from '../persistence/switch-project'
import type { Autosave } from '../persistence/autosave'
import { runStatusLabels } from '../execution/view-state'
import { updateRunDraft } from '../execution/draft-store'
import './task-workspace.css'

export function TaskWorkspace({ autosave }: { autosave: Autosave }) {
  const editor = useEditor(), profile = useProfile()?.profile
  const project = useStore(editor.projectStore, state => state.project)
  const run = useStore(editor.runtime.store)
  const [section, setSection] = useState<'task' | 'connections' | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const editorial = project.nodes.some(node => node.operation?.kind === 'agent' && node.operation.editorial)
  const hasTrigger = project.nodes.some(node => node.type === 'trigger' && node.status !== 'disabled')
  const activeRun = ['running', 'queued', 'waiting'].includes(run.status)
  const openRun = () => { setSection(null); editor.runtime.store.setState({ open: true }) }
  const textTask = (revision = false) => {
    if (!editorial) { setSection('task'); return }
    if (!activeRun && !run.actionPending) {
      const previous = run.snapshot?.project.id === project.project.id ? run.events.findLast(event => event.kind === 'editorial') : undefined
      const text = previous?.kind === 'editorial' ? previous.state.versions.at(-1)?.text : undefined
      updateRunDraft(editor.runDraftStore, project, {
        resultKind: revision ? 'revision' : 'article', advancedInput: false,
        ...(revision ? text ? { previousArticle: text } : {} : { previousArticle: '' }),
      })
      if (run.jobId) editor.runtime.native?.newRun()
    }
    openRun()
  }
  return <section className="task-workspace" aria-label="Рабочее пространство задач">
    <div className="task-toolbar"><span><strong>{profile?.name ?? 'Локальный профиль'}</strong><small>Ваше рабочее пространство</small></span>
      <nav aria-label="Начать работу"><button onClick={() => textTask()}>Создать текст</button><button onClick={() => textTask(true)}>Изменить текст</button><button onClick={() => editor.uiStore.setState({ projects: true })}>Открыть сценарий</button><button aria-expanded={section === 'connections'} onClick={() => setSection(section === 'connections' ? null : 'connections')}>Настроить подключения</button></nav>
      <button onClick={openRun}>Задачи и результаты{run.status !== 'idle' ? ` · ${runStatusLabels[run.status]}` : ''}</button>
    </div>
    {section && <div className="task-overview"><div className="task-overview-heading"><h2>{section === 'connections' ? 'Подключить → проверить → использовать' : 'Подготовьте задание'}</h2><button aria-label="Свернуть рабочее пространство" onClick={() => setSection(null)}>×</button></div>
      <ModelReadiness />
      {section === 'connections' ? <div className="task-connections">
        <article><h3>Локальная модель</h3><p>Выберите установленную модель, разрешите её этому профилю и выполните проверку ответа и инструментов.</p><button onClick={() => editor.uiStore.setState({ serviceDialog: 'ai' })}>Настроить и проверить ИИ</button></article>
        <article><h3>База знаний и фотографии</h3><p>Разрешите папку SOAR, обновите снимок источников. Затем выберите базу и товары в знаниях агента.</p><button onClick={() => editor.uiStore.setState({ serviceDialog: 'knowledge' })}>Открыть базу знаний</button></article>
        <article><h3>Telegram, HTTP и MCP</h3><p>Создайте подключение, проверьте его и выберите в сценарии. Telegram использует опубликованную версию, а не несохранённые правки Canvas.</p><button onClick={() => editor.uiStore.setState({ serviceDialog: 'integrations' })}>Настроить сервисы</button></article>
        <article><h3>Секреты подключений</h3><p>Хранилище токенов само по себе не подключает сервис. Выбирайте сохранённый секрет в настройках интеграции.</p><button disabled={!window.workflowDesktop?.credentials} onClick={() => editor.uiStore.setState({ serviceDialog: 'credentials' })}>Управлять секретами</button>{!window.workflowDesktop?.credentials && <small>Защищённое хранилище доступно в Windows.</small>}</article>
      </div> : <>
        <p>Открытый проект: <strong>{project.project.name}</strong>. Для правок откройте прежний результат и нажмите «Доработать этот текст» или вставьте исходный текст в поле задания. Ничего не отправляется до нажатия запуска.</p>
        {hasTrigger && <button onClick={openRun}>Подготовить запуск текущего сценария</button>}
        {!editorial && <EditorialStarter disabled={busy || activeRun} open={async next => {
          setBusy(true); setError('')
          try { await switchProject(editor, autosave, next); openRun() }
          catch (error) { setError(error instanceof Error ? error.message : String(error)) }
          finally { setBusy(false) }
        }} />}
        {activeRun && <p>Сейчас выполняется задача. Посмотрите её состояние и результат, прежде чем начинать новую.</p>}
        {error && <p role="alert" className="field-error">{error}</p>}
        <button onClick={() => setSection('connections')}>Проверить подключения этого профиля</button>
      </>}
      <details><summary>Проект, публикация, запуск и файл — что где хранится</summary><p>Проект — редактируемая схема на Canvas. Публикация — отдельный снимок для Telegram или расписания; изменения проекта требуют повторной публикации. Запуск — выполнение с собственным состоянием, историей и входным заданием. Файл — результат выбранного запуска. Черновик ещё не отправленного задания хранится только до закрытия приложения или смены профиля.</p><p>Закрытие окна Windows оставляет приложение в трее. Продолжение конкретного запуска зависит от разрешения фоновой работы. Полный выход выполняется через значок возле часов → «Выйти и сохранить состояние запусков»; выполнение прерывается, доступные контрольные точки сохраняются.</p><p>Экспорт проекта содержит схему и настройки, но не секреты, историю запусков или локальные фотографии. Копия коллекции знаний содержит тексты, а не всю установку приложения. Полный перенос установки пока не реализован.</p></details>
    </div>}
  </section>
}
