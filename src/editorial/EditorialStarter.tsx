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
import type { Project } from '../domain/schema'
import { useProfile } from '../profiles/context'
import { aiRequest } from '../ai/client'
import { connectionStateSchema } from '../ai/protocol'
import { knowledgeRequest } from '../knowledge/client'
import { knowledgeListSchema, type KnowledgeView } from '../knowledge/schema'
import { createEditorialExample, defaultEditorialKnowledge } from '../execution/editorial-example'

export function EditorialStarter({ open, disabled }: { open: (project: Project) => Promise<void>; disabled: boolean }) {
  const profile = useProfile()?.profile
  const [available, setAvailable] = useState<{ profileId: string; model: string; collections: KnowledgeView[] } | null>(null)
  const [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const current = available?.profileId === profile?.id ? available : null
  const prepare = async () => {
    if (!profile) return
    setBusy(true); setError(''); setAvailable(null)
    try {
      const [modelValue, knowledgeValue] = await Promise.all([aiRequest({ action: 'state', profileId: profile.id }), knowledgeRequest({ kind: 'list', profileId: profile.id })])
      const connection = connectionStateSchema.parse(modelValue).connection
      if (!connection?.enabled) throw new Error('Сначала подключите и разрешите локальную модель в «ИИ-помощнике» этого профиля. Затем вернитесь к созданию редакции.')
      const collections = knowledgeListSchema.parse(knowledgeValue).collections.filter(collection => collection.enabled)
      if (!collections.length) throw new Error('Сначала подключите базу в «Знания SOAR» и разрешите её использование. Исходная папка останется на компьютере.')
      setAvailable({ profileId: profile.id, model: connection.configuration.model, collections }); setSelected(collections.length === 1 ? collections[0]!.id : '')
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <section className="resource-card" aria-label="Создать локальную редакцию">
    <h3>Локальная редакция · SOAR</h3>
    <p className="muted">Задание с компьютера или из Telegram → замысел → текст → проверка → ваше подтверждение → файл. Облачный ИИ не используется.</p>
    <button disabled={disabled || busy || !profile || !window.workflowDesktop?.runtime} onClick={() => void prepare()}>{busy ? 'Проверяем настройки…' : 'Подготовить редакционный сценарий'}</button>
    {!window.workflowDesktop?.runtime && <p className="muted">Редакция с локальной моделью доступна в Windows-приложении.</p>}
    {current && <>
      <p>Модель профиля: <strong>{current.model}</strong>. Доступность Ollama проверяется при запуске.</p>
      <label className="field"><span>База для этой редакции</span><select value={selected} onChange={event => setSelected(event.target.value)}><option value="">Выберите базу</option>{current.collections.map(collection => <option key={collection.id} value={collection.id}>{collection.label} · {collection.snapshots[0]?.sourceVersion}</option>)}</select></label>
      <p className="muted">Перед запуском можно выбрать конкретный товар и фотографии в «Знаниях агента», а в Run — посмотреть найденные источники.</p>
      <button disabled={disabled || busy || !current.collections.some(collection => collection.id === selected)} onClick={() => void open(createEditorialExample(current.model, { ...defaultEditorialKnowledge, collections: [{ collectionId: selected }] }))}>Создать и открыть редакцию</button>
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>
}
