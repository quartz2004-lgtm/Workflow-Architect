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
import { knowledgeRequest } from './client'
import { mediaListSchema, mediaRecordSchema, type MediaRecord, type MediaView } from './media-schema'
import type { KnowledgeCollection } from './schema'
import { ProductSelector } from './ProductSelector'

export function MediaLibrary({ profileId }: { profileId: KnowledgeCollection['profileId'] }) {
  const [items, setItems] = useState<MediaView[] | null>(null), [selected, setSelected] = useState<MediaRecord | null>(null)
  const [label, setLabel] = useState(''), [sku, setSku] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const refresh = async () => {
    const result = mediaListSchema.parse(await knowledgeRequest({ kind: 'image-list', profileId }))
    setItems(result.images)
    if (result.damaged) setError(`Повреждённые записи: ${result.damaged}. Они не передаются модели.`)
  }
  const perform = async (work: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await work() } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const add = () => perform(async () => {
    const id = await knowledgeRequest({ kind: 'image-import', profileId, label, sku })
    if (typeof id === 'string') { setSelected(mediaRecordSchema.parse(await knowledgeRequest({ kind: 'image-inspect', profileId, id }))); await refresh() }
  })
  return <section className="knowledge-step knowledge-media" aria-label="Фотографии товаров">
    <div className="knowledge-heading"><h3>Фотографии товаров</h3><span>Локально · JPEG / PNG</span></div>
    <p>Выберите товар из базы и добавьте его фотографию. После импорта прикрепите её в «Знаниях агента» — сама по себе загрузка ещё не передаёт фото модели. Для анализа нужна модель с поддержкой изображений (Vision).</p>
    <label>Название фотографии<input value={label} maxLength={120} onChange={event => setLabel(event.target.value)} placeholder="Вид спереди · детали отделки" /></label>
    <ProductSelector profileId={profileId} value={sku} onChange={setSku} />
    <details><summary>Указать код товара вручную</summary><label>SKU фотографии<input value={sku} maxLength={200} onChange={event => setSku(event.target.value)} placeholder="Точный код товара" /></label></details>
    {!sku && <p className="muted">Для фото нужен конкретный товар. Общие референсы и снимки нескольких товаров пока не поддерживаются.</p>}
    <div className="knowledge-actions"><button disabled={busy || !label.trim() || !sku.trim()} onClick={() => void add()}>Выбрать JPEG / PNG…</button><button disabled={busy} onClick={() => void perform(refresh)}>Показать фотографии</button></div>
    {error && <p role="alert" className="knowledge-error">{error}</p>}
    {items?.length === 0 && <p>Фотографий в этом профиле пока нет.</p>}
    {items && <div className="knowledge-media-list">{items.map(item => <article className="knowledge-media-item" key={item.id}>
      <div><strong>{item.label}</strong><p className="knowledge-caption">SKU {item.sku} · {item.width} × {item.height} · {item.enabled ? 'Разрешена' : 'Доступ отозван'}</p></div>
      <div className="knowledge-actions"><button disabled={busy} onClick={() => void perform(async () => setSelected(mediaRecordSchema.parse(await knowledgeRequest({ kind: 'image-inspect', profileId, id: item.id }))))}>Просмотреть {item.label}</button>
        <button disabled={busy} onClick={() => void perform(async () => { await knowledgeRequest({ kind: 'image-enable', profileId, id: item.id, enabled: !item.enabled }); if (selected?.id === item.id) setSelected(null); await refresh() })}>{item.enabled ? 'Отозвать доступ к фото' : 'Разрешить фото'}</button>
        <button disabled={busy} onClick={() => void perform(async () => { await knowledgeRequest({ kind: 'image-remove', profileId, id: item.id }); if (selected?.id === item.id) setSelected(null); await refresh() })}>Удалить фото</button></div>
    </article>)}</div>}
    {selected && <figure className="knowledge-image-preview"><img src={`data:image/png;base64,${selected.image.data}`} width={selected.image.width} height={selected.image.height} alt={selected.label} /><figcaption>{selected.label} · SKU {selected.sku}<br /><span className="knowledge-caption">SHA256 {selected.hash}</span></figcaption></figure>}
    <p className="knowledge-caption">До 8 МБ и 16 млн пикселей на исходный файл; до двух фото в запросе Agent. Для новой версии добавьте новый снимок и выберите его в узле. Копия текстовой коллекции не содержит фотографии; перед переносом приложения сохраните всю папку данных пользователя.</p>
  </section>
}
