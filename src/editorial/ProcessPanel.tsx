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
import type { Profile } from '../profiles/schema'
import { processCommandSchema, type ProcessCommand } from './process-protocol'
import { processLibrarySchema, type ProcessLibrary } from './process-schema'
import { editorialDigest } from './versions'

const defaults = { title: 'Моя редакция', instructions: { planner: '', writer: '', reviewer: '' }, settings: { contextTokens: 32768, maxOutputTokens: 4096, temperature: 0.3, stageTimeoutMs: 600000 }, voiceExampleIds: [] as string[] }

export function ProcessPanel({ profileId }: { profileId: Profile['id'] }) {
  const [library, setLibrary] = useState<ProcessLibrary | null>(null)
  const [draft, setDraft] = useState(defaults)
  const [exampleText, setExampleText] = useState(''), [sourceLabel, setSourceLabel] = useState('Мой пример')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const mounted = useRef(false)
  async function request(command: ProcessCommand) {
    const bridge = window.workflowDesktop?.runtime
    if (!bridge) throw new Error('Настройки редакции доступны в Windows-приложении.')
    const parsed = processCommandSchema.safeParse(command)
    if (!parsed.success) throw new Error('Проверьте заполнение полей: название обязательно, контекст — от 2048 до 32768, лимит ответа — от 128 до 8192, разнообразие — от 0 до 2. Можно выбрать до трёх примеров.')
    return processLibrarySchema.parse(await bridge.request({ kind: 'editorial-process', command: parsed.data }))
  }
  useEffect(() => {
    mounted.current = true
    let active = true
    void request({ action: 'read', profileId }).then(value => { if (active) setLibrary(value) }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false; mounted.current = false }
  }, [profileId])
  async function mutate(command: ProcessCommand, message: string) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const value = await request(command)
      if (mounted.current) { setLibrary(value); setNotice(message) }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { if (mounted.current) setBusy(false) }
  }
  const active = library?.versions.find(version => version.id === library.selectedVersionId)
  const revoked = active?.content.voiceExampleIds.some(id => !library?.examples.some(example => example.id === id && example.status === 'accepted'))
  return <section className="ai-section" aria-label="Редакция и голос">
    <div className="ai-intro"><h3>Редакция и голос</h3><p>Сохраните стиль, который вам подходит. Это инструкции и примеры для локальной модели, а не её обучение. Факты о товаре по-прежнему берутся из досье.</p></div>
    <p role="status">{library ? active ? `Для новых редакционных задач: ${active.content.title}, версия ${active.number}.` : 'Для новых задач используются настройки узла и стандартная редакция.' : 'Загрузка настроек…'}</p>
    {revoked && <p role="alert" className="field-error">В выбранной версии есть отозванный пример. Новая генерация с ним недоступна: выберите другую версию или стандартную редакцию.</p>}
    <p className="muted">Изменения действуют для новых задач «Локальная редакция», включая Telegram. Очередь и история сохраняют выбранную при запуске версию. Обычные Agent не меняются.</p>
    {error && <p role="alert" className="field-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="inline-actions"><button disabled={busy} onClick={() => void mutate({ action: 'read', profileId }, 'Библиотека обновлена.')}>Обновить библиотеку</button>
      <button disabled={busy || !library?.selectedVersionId} onClick={() => library && void mutate({ action: 'select-version', profileId, revision: library.revision, versionId: null }, 'Для новых задач выбрана стандартная редакция.')}>Стандартная редакция</button></div>
    {library && <>
      <fieldset className="ai-form" disabled={busy}><legend>Версии настроек</legend>
        {!library.versions.length && <p className="muted">Версий пока нет. Заполните описание стиля ниже, сохраните версию и выберите её для новых задач.</p>}
        {library.versions.map(version => {
          const unavailable = version.content.voiceExampleIds.some(id => !library.examples.some(example => example.id === id && example.status === 'accepted'))
          return <div key={version.id} className="ai-intro"><strong>{version.content.title} · версия {version.number}</strong>
            <p>{active?.id === version.id ? 'Выбрана для новых задач.' : 'Сохранённая версия.'} {unavailable ? 'Есть отозванный пример — выбор недоступен.' : `${version.content.voiceExampleIds.length} примеров стиля.`}</p>
            <div className="inline-actions"><button disabled={unavailable || active?.id === version.id} onClick={() => void mutate({ action: 'select-version', profileId, revision: library.revision, versionId: version.id }, `Выбрана версия ${version.number}. Уже поставленные задачи не изменены.`)}>Использовать версию {version.number}</button>
              <button onClick={() => { setDraft(structuredClone(version.content)); setNotice('Настройки скопированы в форму. Изменения сохранятся отдельной версией.') }}>Взять за основу</button></div>
          </div>
        })}
      </fieldset>
      <fieldset className="ai-form" disabled={busy}><legend>Новая версия</legend>
        <label className="field"><span>Название</span><input value={draft.title} maxLength={150} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field"><span>Как должен звучать текст</span><textarea rows={4} maxLength={3000} placeholder="Например: спокойно, живо, с конкретными примерами выбора. Без давления на покупателя." value={draft.instructions.writer} onChange={event => setDraft({ ...draft, instructions: { ...draft.instructions, writer: event.target.value } })} /></label>
        <p>Принятые примеры для этой версии · до трёх</p>
        {!library.examples.some(example => example.status === 'accepted') && <p className="muted">Примеров пока нет. Версию можно сохранить без них или добавить текст ниже.</p>}
        {library.examples.filter(example => example.status === 'accepted' || draft.voiceExampleIds.includes(example.id)).map(example => <label className="ai-check" key={example.id}><input type="checkbox" checked={draft.voiceExampleIds.includes(example.id)} disabled={!draft.voiceExampleIds.includes(example.id) && draft.voiceExampleIds.length >= 3} onChange={event => setDraft({ ...draft, voiceExampleIds: event.target.checked ? [...draft.voiceExampleIds, example.id] : draft.voiceExampleIds.filter(id => id !== example.id) })} />{example.sourceLabel}{example.status !== 'accepted' && ' · Отозван — снимите отметку перед сохранением'}</label>)}
        <details><summary>Расширенные настройки</summary>
          {(['planner', 'reviewer'] as const).map(stage => <label className="field" key={stage}><span>{stage === 'planner' ? 'Дополнение к замыслу' : 'Дополнение к проверке'}</span><textarea rows={2} maxLength={3000} value={draft.instructions[stage]} onChange={event => setDraft({ ...draft, instructions: { ...draft.instructions, [stage]: event.target.value } })} /></label>)}
          <label className="field"><span>Разнообразие формулировок</span><input type="number" min={0} max={2} step={0.1} value={draft.settings.temperature} onChange={event => setDraft({ ...draft, settings: { ...draft.settings, temperature: event.target.valueAsNumber } })} /></label>
          <label className="field"><span>Контекст · токены</span><input type="number" min={2048} max={32768} value={draft.settings.contextTokens} onChange={event => setDraft({ ...draft, settings: { ...draft.settings, contextTokens: event.target.valueAsNumber } })} /></label>
          <label className="field"><span>Лимит ответа · токены</span><input type="number" min={128} max={8192} value={draft.settings.maxOutputTokens} onChange={event => setDraft({ ...draft, settings: { ...draft.settings, maxOutputTokens: event.target.valueAsNumber } })} /></label>
          <p className="muted">На этап отведено {draft.settings.stageTimeoutMs / 60000} мин. Общий лимит задачи сохраняется. Больший контекст требует больше памяти; он не гарантирует лучший текст.</p>
        </details>
        <button className="primary" disabled={!draft.title.trim()} onClick={() => void mutate({ action: 'save-version', profileId, revision: library.revision, content: draft }, 'Версия сохранена. Чтобы применить её, выберите «Использовать версию» выше.')}>Сохранить новую версию</button>
      </fieldset>
      <fieldset className="ai-form" disabled={busy}><legend>Примеры голоса</legend>
        <p>Вставьте короткий отрывок, чей язык вам нравится. Не добавляйте секреты и контрольные ответы испытаний. Сохранение создаёт черновик; затем отдельно подтвердите точный текст.</p>
        <label className="field"><span>Название или происхождение</span><input maxLength={500} value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} /></label>
        <label className="field"><span>Текст примера · до 3000 символов</span><textarea rows={5} maxLength={3000} value={exampleText} onChange={event => setExampleText(event.target.value)} /></label>
        <button disabled={!exampleText.trim() || !sourceLabel.trim()} onClick={() => {
          const text = exampleText.trim(), label = sourceLabel.trim(), revision = library.revision
          void editorialDigest(text).then(sourceDigest => mutate({ action: 'add-example', profileId, revision, example: { text, sourceLabel: label, sourceDigest, origin: 'development' } }, 'Пример сохранён как черновик. Прочитайте его и примите ниже.')).catch(reason => setError(String(reason)))
        }}>Сохранить черновик примера</button>
        {library.examples.map(example => <details key={example.id}><summary>{example.sourceLabel} · {example.status === 'pending' ? 'Черновик' : example.status === 'accepted' ? 'Принят' : 'Отозван'}</summary>
          <p style={{ whiteSpace: 'pre-wrap' }}>{example.text}</p>
          {example.status === 'pending' && <button onClick={() => void mutate({ action: 'accept-example', profileId, revision: library.revision, exampleId: example.id, digest: example.digest }, 'Пример принят. Выберите его при создании версии настроек.')}>Принять этот текст как пример стиля</button>}
          {example.status === 'accepted' && <><p className="muted">Отзыв остановит будущие вызовы модели с этим примером, в том числе в незавершённых задачах. Сохранённые тексты останутся.</p><button onClick={() => void mutate({ action: 'revoke-example', profileId, revision: library.revision, exampleId: example.id }, 'Пример отозван. Для продолжения выберите настройки без него.')}>Отозвать пример</button></>}
        </details>)}
      </fieldset>
    </>}
  </section>
}
