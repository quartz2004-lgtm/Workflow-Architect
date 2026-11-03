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

import { useEffect, useId, useRef, useState } from 'react'
import type { Profile } from '../profiles/schema'
import { blindReviewAnswerSchema, reviewCommandSchema, reviewListSchema, reviewViewSchema, type ReviewCommand, type ReviewView } from './review-protocol'
import { resultTypes } from '../editorial/task-form'
import { SourceContent } from '../knowledge/SourceContent'
import './review.css'

async function request(command: ReviewCommand) {
  const bridge = window.workflowDesktop?.runtime
  if (!bridge) throw new Error('Сравнение доступно в Windows-приложении.')
  return bridge.request({ kind: 'evaluation-review', command: reviewCommandSchema.parse(command) })
}
const criteria = { accuracy: 'Точность фактов', usefulness: 'Полезность', naturalness: 'Живой язык', structure: 'Структура' }
function Choice({ name, title, options }: { name: string; title: string; options: [string, string][] }) {
  const id = useId()
  return <label className="field"><span id={id}>{title}</span><select aria-labelledby={id} name={name} required defaultValue=""><option value="" disabled>Выберите ответ</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
}
export function ReviewPanel({ profileId }: { profileId: Profile['id'] }) {
  const [items, setItems] = useState<ReturnType<typeof reviewListSchema.parse>>([])
  const [view, setView] = useState<ReviewView | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [notice, setNotice] = useState(''), [loaded, setLoaded] = useState(false)
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    void request({ action: 'list', profileId }).then(value => { if (alive.current) { setItems(reviewListSchema.parse(value)); setLoaded(true) } }).catch(reason => { if (alive.current) setError(String(reason)) })
    return () => { alive.current = false }
  }, [profileId])
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (reason) { if (alive.current) setError(String(reason)) }
    finally { if (alive.current) setBusy(false) }
  }
  async function refresh() {
    const list = reviewListSchema.parse(await request({ action: 'list', profileId }))
    if (alive.current) { setItems(list); setLoaded(true) }
  }
  async function open(id: string) {
    const next = reviewViewSchema.parse(await request({ action: 'open', profileId, id }))
    if (alive.current) setView(next)
  }
  async function submit(form: HTMLFormElement) {
    if (!view) return
    const data = new FormData(form)
    const side = (label: string) => ({
      scores: Object.fromEntries(Object.keys(criteria).map(key => [key, Number(data.get(`${label}.${key}`))])),
      unsupportedProductOrMedicalClaim: data.get(`${label}.claims`) === 'yes',
      acceptedWithMinorEdits: data.get(`${label}.accept`) === 'yes',
    })
    const answer = blindReviewAnswerSchema.parse({ A: side('A'), B: side('B'), accuracyPreference: data.get('accuracyPreference'), overallPreference: data.get('overallPreference'), notes: data.get('notes') })
    await request({ action: 'submit', profileId, id: view.id, digest: view.digest, answer })
    if (alive.current) { setView({ ...view, submitted: true }); setNotice('Оценка сохранена для этой пары текстов. Спасибо.') }
    await refresh()
  }
  return <section className="ai-intro blind-review">
    <h3>Сравнение текстов</h3><p>Прочитайте задание, источники и оба варианта. Происхождение текстов скрыто, порядок A/B случаен. Оценивайте самостоятельно: согласие с другим участником не требуется.</p>
    <p className="muted">Оценка сохраняется один раз для показанных версий. Она не публикует текст и не обучает модель. При ошибке отправки обновите список и откройте пару снова, чтобы проверить сохранение.</p>
    {error && <p role="alert" className="field-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button disabled={busy} onClick={() => void perform(refresh)}>Обновить список сравнений</button>
    {!loaded && !error && <p role="status">Загрузка сравнений…</p>}
    {loaded && !items.length && <p>Для вашего профиля пока нет подготовленных пар. Они появятся после контрольных испытаний; запускать обычную статью для этого не нужно.</p>}
    <ul className="review-list">{items.map((item, index) => <li key={item.id}><button disabled={busy} aria-pressed={view?.id === item.id} onClick={() => void perform(() => open(item.id))}>Пара {index + 1} · {resultTypes.find(type => type.kind === item.kind)?.label} · {item.submitted ? 'Оценена' : 'Ждёт оценки'}</button></li>)}</ul>
    {view && <div key={view.id}>
      <h4>Задание</h4><pre className="review-text">{view.prompt}</pre>
      <p>{view.contract.minimumWords > 0 ? `Объём: от ${view.contract.minimumWords} слов` : 'Минимальный объём не задан'}{view.contract.maximumWords !== undefined && `, не больше ${view.contract.maximumWords}`}.{view.contract.minimumSections > 0 && ` Разделов: не меньше ${view.contract.minimumSections}.`}{view.contract.requiredItems && ` Пунктов: ${view.contract.requiredItems}.`}</p>
      {view.previousText && <details><summary>Исходный текст для правки</summary><pre className="review-text">{view.previousText}</pre></details>}
      <details><summary>Источники · {view.sources.length}</summary>{view.sources.map((source, index) => <article key={index}><h4>{source.path} · {source.locator}</h4><p className="muted">Версия {source.sourceVersion}</p><SourceContent content={source.content} /></article>)}{view.gaps.map((gap, index) => <p key={index} className="field-error">{gap.detail}</p>)}</details>
      {view.submitted && <p role="status">Эта пара уже оценена. Тексты доступны для чтения, изменение оценки закрыто.</p>}
      <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; void perform(() => submit(form)) }}>
        <fieldset disabled={busy || view.submitted} className="review-fieldset"><legend>Оценка вариантов · 1 — плохо, 10 — отлично</legend>
          <div className="review-columns">{(['A', 'B'] as const).map(label => <section key={label} aria-label={`Вариант ${label}`}><h4>Вариант {label}</h4><pre className="review-text">{view[label]}</pre>
            {Object.entries(criteria).map(([key, title]) => <Choice key={key} name={`${label}.${key}`} title={`${label} · ${title}`} options={Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)])} />)}
            <Choice name={`${label}.claims`} title={`${label} · Есть неподтверждённые свойства товара или медицинские обещания?`} options={[[ 'yes', 'Да' ], [ 'no', 'Нет' ]]} />
            <Choice name={`${label}.accept`} title={`${label} · Готовы принять с небольшими правками?`} options={[[ 'yes', 'Да' ], [ 'no', 'Нет, нужна существенная редактура' ]]} />
          </section>)}</div>
          <Choice name="accuracyPreference" title="Какой вариант точнее по фактам?" options={[[ 'A', 'A' ], [ 'B', 'B' ], [ 'equal', 'Одинаково' ]]} />
          <Choice name="overallPreference" title="Какой вариант лучше в целом?" options={[[ 'A', 'A' ], [ 'B', 'B' ], [ 'equal', 'Одинаково' ]]} />
          <label className="field"><span>Замечания · необязательно</span><textarea name="notes" maxLength={12000} rows={3} /></label>
          <button type="submit">Сохранить окончательную оценку</button>
        </fieldset>
      </form>
    </div>}
  </section>
}
