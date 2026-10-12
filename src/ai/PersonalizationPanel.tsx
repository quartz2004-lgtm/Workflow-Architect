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

import { useEffect, useId, useState } from 'react'
import { useProfile } from '../profiles/context'
import { PreferencesForm } from '../profiles/PreferencesForm'
import { preferencesSchema, type ProfilePreferences } from '../profiles/schema'
import { FieldHelp } from '../help/FieldHelp'
import { useAssistantTask } from './client'
import { personalizationSchema } from './assistant-schema'
import { preserveOriginalPreferences, readOriginalPreferences } from './preferences-backup'
import { TaskStatus } from './TaskStatus'

export function PersonalizationPanel() {
  const fieldId = useId()
  const session = useProfile()!
  const { profile } = session, task = useAssistantTask(profile.id)
  const [trial, setTrial] = useState(''), [draft, setDraft] = useState<ProfilePreferences>(profile.preferences), [original, setOriginal] = useState<ProfilePreferences | null>(null)
  const [baseRevision, setBaseRevision] = useState(profile.revision), [pending, setPending] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const result = task.task?.status === 'succeeded' ? personalizationSchema.safeParse(task.task.result) : null
  const recommendation = result?.success ? result.data : null
  useEffect(() => {
    let active = true
    void readOriginalPreferences(profile.id).then(value => { if (active) setOriginal(value) }).catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)) })
    return () => { active = false }
  }, [profile.id])
  const apply = async (preferences: ProfilePreferences, restoring = false) => {
    if (profile.revision !== baseRevision) { setError('Профиль изменился. Откройте этот раздел заново, чтобы не перезаписать свежие настройки.'); return }
    setPending(true); setError(''); setMessage('')
    try {
      const value = preferencesSchema.parse(preferences)
      if (!restoring) setOriginal(await preserveOriginalPreferences(profile.id, profile.preferences))
      await session.save({ ...profile, preferences: value })
      setBaseRevision(profile.revision + 1); setDraft(value); setMessage(restoring ? 'Исходные настройки восстановлены.' : 'Настройки применены. Их можно изменить вручную или восстановить исходные.')
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setPending(false) }
  }
  return <section className="ai-section" aria-label="Персональные рекомендации ИИ">
    <div className="ai-intro"><span className="eyebrow">PERSONAL SETUP</span><h3>Настройки под вашу работу</h3><p>ИИ сопоставит анкету первого запуска с вашим пробным заданием. Выберите один из вариантов, при желании измените его, затем примените.</p></div>
    <details><summary>Какие ответы будут проанализированы</summary><p>Цели: {profile.answers.goals || 'не указаны'}</p><p>Задачи: {profile.answers.tasks || 'не указаны'}</p><p>Опыт: {profile.answers.experience} · Контроль: {profile.answers.control} · Практика: {profile.answers.practice}</p><p>Сервисы: {profile.answers.services || 'не указаны'}</p></details>
    <label className="field" htmlFor={fieldId}><span>Пробная задача и ваши впечатления <FieldHelp helpKey="ai.trial" /></span><textarea id={fieldId} rows={4} maxLength={12000} value={trial} disabled={task.busy} onChange={event => setTrial(event.target.value)} placeholder="Что попробовали сделать? Что было понятно, а где потребовалась помощь? Можно вставить небольшой пример вашей работы." /></label>
    <button className="primary" disabled={task.busy || !trial.trim() || pending} onClick={() => { setBaseRevision(profile.revision); void task.start({ mode: 'personalize', answers: profile.answers, preferences: profile.preferences, trial }) }}>Проанализировать и предложить варианты</button>
    <TaskStatus controller={task} />
    {recommendation && <><p className="ai-analysis">{recommendation.analysis}</p><div className="ai-presets">{recommendation.options.map((option, index) => <article className="ai-preset" key={index}><h4>{option.title}</h4><p>{option.explanation}</p><button disabled={pending} onClick={() => { setDraft({ ...profile.preferences, ...option.preferences }); setMessage(`Выбран вариант «${option.title}». Проверьте настройки ниже и нажмите «Применить».`) }}>Выбрать этот вариант</button></article>)}</div></>}
    <details open={!!recommendation}><summary>Просмотреть и изменить настройки вручную</summary><PreferencesForm value={draft} change={setDraft} showRuntimeRecommendations={false} /><div className="inline-actions"><button className="primary" disabled={pending} onClick={() => void apply(draft)}>Применить настройки</button><button disabled={pending || !original} onClick={() => { if (original) void apply(original, true) }}>Вернуть настройки до ИИ</button></div></details>
    {message && <p role="status">{message}</p>}{error && <p className="field-error" role="alert">{error}</p>}
    <p className="muted">Рекомендации не меняют подключения, разрешения инструментов или лимиты текущих запусков. Это анализ ответов, без дообучения модели и обещаний освоения за заданное время.</p>
  </section>
}
