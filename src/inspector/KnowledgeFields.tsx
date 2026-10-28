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
import { agentKnowledgeSchema, defaultAgentKnowledge, type AgentKnowledge } from '../domain/knowledge-config'
import { useProfile } from '../profiles/context'
import { knowledgeRequest } from '../knowledge/client'
import { knowledgeListSchema, type KnowledgeView } from '../knowledge/schema'
import { contextPacketSchema, type ContextPacket } from '../knowledge/context'
import { ContextPacketView } from '../knowledge/ContextPacketView'
import { TextField, SelectField } from './controls'
import { mediaListSchema, type MediaView } from '../knowledge/media-schema'
import { FieldHelp } from '../help/FieldHelp'
import { ProductSelector } from '../knowledge/ProductSelector'

export function KnowledgeFields({ value, commit }: { value?: AgentKnowledge; commit: (value: AgentKnowledge) => void }) {
  const profile = useProfile()?.profile, settings = value ?? defaultAgentKnowledge
  const [collections, setCollections] = useState<KnowledgeView[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [images, setImages] = useState<MediaView[] | null>(null)
  const [task, setTask] = useState(''), [preview, setPreview] = useState<ContextPacket | null>(null)
  const save = (next: AgentKnowledge) => {
    const parsed = agentKnowledgeSchema.safeParse(next)
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join('; ')); return }
    commit(parsed.data); setPreview(null); setError('')
  }
  const load = async () => {
    if (!profile) return
    setBusy(true); setError('')
    try {
      const [knowledge, media] = await Promise.all([knowledgeRequest({ kind: 'list', profileId: profile.id }), knowledgeRequest({ kind: 'image-list', profileId: profile.id })])
      setCollections(knowledgeListSchema.parse(knowledge).collections); setImages(mediaListSchema.parse(media).images)
    }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const search = async () => {
    if (!profile) return
    setBusy(true); setError(''); setPreview(null)
    try { setPreview(contextPacketSchema.parse(await knowledgeRequest({ kind: 'context-preview', profileId: profile.id, settings, task: task || settings.query }))) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <details className="knowledge-fields"><summary>Знания агента · {settings.collections.length} коллекций · {settings.imageIds.length} фото</summary>
    <p className="muted">Выберите разрешённые коллекции этого профиля. При запуске сохраняются конкретные версии и выдержки. Файлы исходной папки не отправляются автоматически.</p>
    <button disabled={busy || !window.workflowDesktop?.knowledge} onClick={() => void load()}>{collections ? 'Обновить источники профиля' : 'Показать источники профиля'}</button>
    {collections?.length === 0 && <p className="muted">Сначала добавьте базу в окне «Знания».</p>}
    {collections?.map(collection => {
      const selected = settings.collections.find(item => item.collectionId === collection.id)
      return <div key={collection.id}>
        <label className="check-field"><input type="checkbox" checked={!!selected} disabled={!collection.enabled && !selected} onChange={event => save({ ...settings, collections: event.target.checked ? [...settings.collections, { collectionId: collection.id }] : settings.collections.filter(item => item.collectionId !== collection.id) })} />{collection.label}{!collection.enabled ? ' · доступ отозван' : ''}</label>
        {selected && <SelectField label={`Версия · ${collection.label}`} helpKey="knowledge.version" value={selected.snapshotId ?? ''} empty={false} options={[{ value: '', label: 'Текущая на момент запуска' }, ...collection.snapshots.map(snapshot => ({ value: snapshot.id, label: `${snapshot.sourceVersion} · ${new Date(snapshot.createdAt).toLocaleString('ru')}` }))]} commit={snapshotId => save({ ...settings, collections: settings.collections.map(item => item.collectionId === collection.id ? { collectionId: item.collectionId, ...(snapshotId ? { snapshotId } : {}) } : item) })} />}
      </div>
    })}
    {collections && settings.collections.filter(selected => !collections.some(collection => collection.id === selected.collectionId)).map(selected => <p key={selected.collectionId} className="field-error">Коллекция недоступна: {selected.collectionId} <button onClick={() => save({ ...settings, collections: settings.collections.filter(item => item !== selected) })}>Убрать ссылку</button></p>)}
    <TextField label="Поисковый запрос" helpKey="knowledge.query" value={settings.query} multiline commit={query => save({ ...settings, query })} hint="Пусто — искать по исходному заданию из Manual или Telegram." />
    {profile && <ProductSelector allowGeneral profileId={profile.id} collections={settings.collections} value={settings.sku} onChange={sku => save({ ...settings, sku, imageIds: sku === settings.sku ? settings.imageIds : [] })} />}
    {images && <section aria-label="Фотографии для Agent"><p>Фотографии · до двух <FieldHelp helpKey="knowledge.images" /></p>
      {images.length === 0 && <p className="muted">Добавьте снимки в «Знания SOAR → Фотографии товаров».</p>}
      {images.map(image => {
        const selected = settings.imageIds.includes(image.id)
        const reason = !image.enabled ? 'доступ отозван' : !settings.sku ? 'сначала выберите товар' : image.sku.trim().toLocaleLowerCase('ru') !== settings.sku.trim().toLocaleLowerCase('ru') ? 'фото другого товара' : settings.imageIds.length >= 2 && !selected ? 'уже выбраны две фотографии' : ''
        return <label className="check-field" key={image.id}><input type="checkbox" checked={selected} disabled={!selected && !!reason} onChange={event => save({ ...settings, imageIds: event.target.checked ? [...settings.imageIds, image.id] : settings.imageIds.filter(id => id !== image.id) })} />{image.label}{reason ? ` · ${reason}` : ''}</label>
      })}
      {settings.imageIds.filter(id => !images.some(image => image.id === id)).map(id => <p className="field-error" key={id}>Фотография недоступна <button onClick={() => save({ ...settings, imageIds: settings.imageIds.filter(value => value !== id) })}>Убрать ссылку</button></p>)}
      <p className="muted">Фото должны относиться к выбранному товару. При смене товара выбор фото сбрасывается; его можно отменить через Undo. Фото передаются только модели с Vision.</p>
    </section>}
    <details><summary>Расширенные настройки источников</summary>
    <TextField label="Точный SKU товара" helpKey="knowledge.sku" value={settings.sku} commit={sku => save({ ...settings, sku, imageIds: sku === settings.sku ? settings.imageIds : [] })} />
    <TextField label="ID источников · по одному на строку" helpKey="knowledge.ids" value={settings.sourceIds.join('\n')} multiline commit={text => save({ ...settings, sourceIds: text.split('\n').map(item => item.trim()).filter(Boolean) })} />
    <TextField label="Бюджет пакета · байт" helpKey="knowledge.bytes" type="number" value={String(settings.maxBytes)} commit={text => save({ ...settings, maxBytes: Number(text) })} hint="Пакет целиком должен поместиться в окно модели вместе с заданием и ответом." />
    <TextField label="Максимум выдержек" helpKey="knowledge.count" type="number" value={String(settings.maxExcerpts)} commit={text => save({ ...settings, maxExcerpts: Number(text) })} />
    </details>
    <TextField label="Тестовое задание для поиска" helpKey="knowledge.preview" value={task} multiline commit={setTask} />
    <button disabled={busy || !(settings.collections.length || settings.imageIds.length) || !(task || settings.query) || !window.workflowDesktop?.knowledge} onClick={() => void search()}>Проверить источники без запуска ИИ</button>
    {error && <p role="alert" className="field-error">{error}</p>}
    {preview && <><p className="muted">Предпросмотр поиска. При настоящем запуске пакет фиксируется заново.</p><ContextPacketView packet={preview} /></>}
  </details>
}
