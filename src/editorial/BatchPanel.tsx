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

import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { z } from 'zod'
import type { Project } from '../domain/schema'
import type { Profile } from '../profiles/schema'
import type { NativeRunControls } from '../execution/desktop-controller'
import { runStatusLabels } from '../execution/view-state'
import { batchCommandSchema, batchRequestSchema, batchViewSchema, type BatchView } from './batch-schema'
import { taskFromForm } from './task-form'

type Request = z.infer<typeof batchRequestSchema>
function parseList(raw: unknown, profileId: Profile['id']) {
  const values = z.array(batchViewSchema).max(100).parse(raw)
  if (values.some(value => value.profileId !== profileId)) throw new Error('Получена очередь другого профиля.')
  return values
}
export function BatchPanel({ profileId, project, entryNodeId, native }: { profileId: Profile['id']; project: Project; entryNodeId: string; native: NativeRunControls }) {
  const local = useStore(native.store)
  const [topics, setTopics] = useState(['']), [audience, setAudience] = useState('Общая аудитория'), [minimumWords, setMinimumWords] = useState(600)
  const [background, setBackground] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [batches, setBatches] = useState<BatchView[]>([]), [pending, setPending] = useState<Request | null>(null), [sent, setSent] = useState(false)
  const ready = local.service.status === 'ready'
  async function request(command: z.infer<typeof batchCommandSchema>) {
    if (!window.workflowDesktop?.runtime) throw new Error('Очередь доступна в Windows-приложении.')
    return window.workflowDesktop.runtime.request({ kind: 'editorial-batch', command: batchCommandSchema.parse(command) })
  }
  useEffect(() => {
    let active = true
    void request({ action: 'list', profileId }).then(raw => { const values = parseList(raw, profileId); if (active) setBatches(values) }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [profileId])
  async function act(command: z.infer<typeof batchCommandSchema>) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const raw = await request(command)
      if (command.action === 'list') {
        const values = parseList(raw, profileId); setBatches(values)
        if (pending) { setSent(values.some(value => value.id === pending.id)); setPending(null) }
      }
      else {
        const value = batchViewSchema.parse(raw)
        if (value.profileId !== profileId) throw new Error('Получена очередь другого профиля.')
        setBatches(previous => [value, ...previous.filter(batch => batch.id !== value.id)])
        if (command.action === 'submit') {
          setPending(null); setSent(true)
          const first = value.items.find(item => item.submitted)
          if (first) native.select(first.id)
        }
      }
      native.refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  function submit() {
    try {
      const frozen = pending ?? batchRequestSchema.parse({ id: crypto.randomUUID(), profileId, project, entryNodeId, background,
        items: topics.map(text => ({ id: crypto.randomUUID(), task: taskFromForm({ kind: 'article', text, audience, minimumWords, items: 5, previousArticle: '' }) })),
      })
      setPending(frozen)
      void act({ action: 'submit', request: frozen })
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  return <section className="run-editorial editorial-batch" aria-label="Очередь материалов">
    <h3>Несколько статей · до десяти</h3>
    <p className="muted">Для каждой темы — своё досье, текст, проверка и подтверждение. Когда места выполнения заняты ожиданием Human, откройте готовые тексты и примите решение, чтобы очередь двигалась дальше.</p>
    <p className="muted">Источники и модель берутся из текущего сценария. Пакеты фиксируются отдельно при постановке материалов. Первый старт — в течение 24 часов. После старта действуют лимиты сценария, включая ожидание вашего решения.</p>
    {!sent && <fieldset className="run-start" disabled={busy || !!pending}><legend>Темы новой очереди</legend>
      {topics.map((topic, index) => <label key={index}>Материал {index + 1}<textarea rows={2} maxLength={12000} value={topic} onChange={event => setTopics(topics.map((value, i) => i === index ? event.target.value : value))} placeholder="Тема, товар и пожелания к этой статье" /></label>)}
      <div className="inline-actions"><button disabled={topics.length >= 10} onClick={() => setTopics([...topics, ''])}>Добавить материал</button><button disabled={topics.length <= 1} onClick={() => setTopics(topics.slice(0, -1))}>Убрать последний</button></div>
      <label>Аудитория всех материалов<input value={audience} maxLength={1000} onChange={event => setAudience(event.target.value)} /></label>
      <label>Минимум слов в каждой статье<input type="number" min={600} max={5000} value={minimumWords} onChange={event => setMinimumWords(Number(event.target.value))} /></label>
      <label className="check-field"><input type="checkbox" checked={background} onChange={event => setBackground(event.target.checked)} />Разрешить всей очереди работать после закрытия окна</label>
      <p className="muted">Без этого разрешения закрытие окна отменит незавершённые материалы.</p>
    </fieldset>}
    {pending && <p role="status">Результат отправки уточняется. Повтор использует те же задания и ключи; темы временно заблокированы. «Обновить очереди» проверит сохранение: если очередь не создана, форму снова можно редактировать.</p>}
    <div className="inline-actions">{!sent ? <button className="primary" disabled={busy || !ready || topics.some(topic => !topic.trim())} onClick={submit}>{pending ? 'Повторить отправку без дубликатов' : `Поставить в очередь · ${topics.length}`}</button> : <button disabled={busy} onClick={() => { setSent(false); setTopics(['']); setError('') }}>Подготовить другую очередь</button>}
    <button disabled={busy || !ready} onClick={() => void act({ action: 'list', profileId })}>Обновить очереди</button>
    </div>
    {error && <p role="alert" className="field-error">{error}</p>}
    {!batches.length && <p className="muted">Сохранённых очередей пока нет.</p>}
    {batches.map(batch => <details key={batch.id} open><summary>{batch.projectName} · {batch.items.length} материалов · {batch.cancelled ? 'Отменена' : new Date(batch.createdAt).toLocaleString('ru-RU')}</summary>
      <p className="muted">{batch.background ? 'Разрешена работа после закрытия окна.' : 'Закрытие окна отменяет незавершённые материалы.'}</p>
      <ol>{batch.items.map(item => {
        const job = local.jobs.find(job => job.id === item.id)
        return <li key={item.id}><strong>{item.title}</strong><p>{job ? runStatusLabels[job.status] : item.submitted ? 'Запись запуска пока недоступна. Обновите историю.' : batch.cancelled ? 'Не отправлен · очередь отменена' : 'Не поставлен в очередь'}</p>
          {item.error && <p className="field-error">{item.error}</p>}
          <button disabled={!ready || !job || busy} onClick={() => native.select(item.id)}>Открыть материал</button>
        </li>
      })}</ol>
      {!batch.cancelled && <div className="inline-actions">{batch.items.some(item => !item.submitted) && <button disabled={busy || !ready} onClick={() => void act({ action: 'retry', profileId, id: batch.id })}>Повторить неотправленные</button>}<button disabled={busy || !ready} onClick={() => void act({ action: 'cancel', profileId, id: batch.id })}>Остановить незавершённые материалы</button></div>}
    </details>)}
  </section>
}
