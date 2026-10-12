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
import type { RunController } from './view-state'
import type { NativeRunControls } from './desktop-controller'
import { runStatusLabels } from './view-state'

export function RuntimeControls({ runtime, native }: { runtime: RunController; native: NativeRunControls }) {
  const state = useStore(runtime.store), local = useStore(native.store)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ready = local.service.status === 'ready', busy = state.actionPending
  const label = { starting: 'Сервис запускается', ready: 'Фоновый сервис подключён', unavailable: 'Связь с сервисом потеряна', stopped: 'Сервис остановлен' }[local.service.status]
  return <section className="runtime-controls" aria-label="Фоновый сервис и история">
    <div className="runtime-connection"><span className={ready ? 'runtime-ready' : 'runtime-unavailable'} aria-hidden="true">{ready ? '●' : '○'}</span><strong role="status">{label}</strong>
      {!ready && <button disabled={busy || local.service.status === 'starting'} onClick={native.reconnect}>Переподключить</button>}</div>
    {!ready && <p className="muted">{local.service.message || 'Ожидаем готовности локального процесса.'} Показаны последние полученные данные; редактор остаётся доступен.</p>}
    {local.error && <p role="alert" className="field-error">{local.error}</p>}
    {!!local.service.damaged.length && <details><summary>Не удалось открыть записи: {local.service.damaged.length}</summary><p className="muted">Повреждённые записи не исполняются и сохранены на диске.</p>{local.service.damaged.map(item => <p key={item.id} className="run-identification">{item.id}: {item.message}</p>)}</details>}
    <div className="runtime-history-heading"><h3>История этого профиля · {local.jobs.length}</h3><button disabled={!ready || busy} onClick={native.refresh}>Обновить историю</button></div>
    <label>Сохранённые запуски<select aria-label="Сохранённые запуски" disabled={!ready || busy || !local.jobs.length} value={local.jobs.some(job => job.id === state.jobId) ? state.jobId! : ''} onChange={event => { setConfirmDelete(false); native.select(event.target.value) }}>
      <option value="" disabled>{local.jobs.length ? 'Выберите запуск' : 'Пока нет запусков'}</option>
      {local.jobs.map(job => <option key={job.id} value={job.id}>{job.projectName} · {runStatusLabels[job.status]} · {new Date(job.createdAt).toLocaleString('ru-RU')}</option>)}
    </select></label>
    <div className="inline-actions runtime-history-actions">
      <button disabled={busy} onClick={() => { setConfirmDelete(false); native.newRun() }}>Новый запуск</button>
      {['queued', 'running', 'waiting', 'interrupted'].includes(state.status) && <button disabled={!ready || busy} onClick={runtime.cancel}>Остановить запуск</button>}
      {state.status === 'interrupted' && <button disabled={!ready || busy} onClick={native.resume}>Продолжить запуск</button>}
      {local.pendingSubmission && state.status === 'unknown' && <button disabled={!ready || busy} onClick={native.retrySubmission}>Повторить отправку с тем же ключом</button>}
      {state.jobId && ['succeeded', 'failed', 'cancelled'].includes(state.status) && <button disabled={!ready || busy} onClick={() => setConfirmDelete(true)}>Удалить запись</button>}
    </div>
    {confirmDelete && <div className="runtime-delete" role="group" aria-label="Удаление записи запуска"><p>Удалятся журнал, результаты и ключ защиты от повторной доставки этого запуска. Сначала сохраните нужные файлы.</p><div className="inline-actions"><button disabled={!ready || busy} onClick={() => { native.remove(); setConfirmDelete(false) }}>Удалить окончательно</button><button onClick={() => setConfirmDelete(false)}>Оставить запись</button></div></div>}
    {state.jobId && <p className="muted">Этот запуск: {state.backgroundAllowed ? 'может работать после закрытия окна' : 'останавливается при закрытии окна'}. Настройка зафиксирована при отправке.</p>}
  </section>
}

export function BackgroundConsent({ native, disabled, runningAllowed }: { native: NativeRunControls; disabled: boolean; runningAllowed?: boolean }) {
  const allowed = useStore(native.store, state => state.background)
  return <label className="runtime-consent"><input type="checkbox" checked={runningAllowed ?? allowed} disabled={disabled} onChange={event => native.store.setState({ background: event.target.checked })} /><span>Разрешить этому запуску работать после закрытия окна</span></label>
}
