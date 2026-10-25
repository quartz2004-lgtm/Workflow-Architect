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

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '../shared/Modal'
import { knowledgeRequest } from './client'
import { knowledgeDocumentSchema, knowledgeListSchema, knowledgePreviewSchema, knowledgeScanSchema, type KnowledgeCollection, type KnowledgeDocument, type KnowledgePreview, type KnowledgeScan, type KnowledgeView } from './schema'
import './knowledge.css'
import { MediaLibrary } from './MediaLibrary'

const date = (value: string) => new Date(value).toLocaleString('ru-RU')
export function KnowledgeDialog({ profileId, profileName, close }: { profileId: KnowledgeCollection['profileId']; profileName: string; close: () => void }) {
  const [collections, setCollections] = useState<KnowledgeView[]>([]), [damaged, setDamaged] = useState(0)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<KnowledgeView | null>(null), [showImport, setShowImport] = useState(false)
  const [sourcePath, setSourcePath] = useState(''), [label, setLabel] = useState('SOAR · актуальная база')
  const [scan, setScan] = useState<KnowledgeScan | null>(null), [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<KnowledgePreview | null>(null), [consent, setConsent] = useState(false)
  const [document, setDocument] = useState<KnowledgeDocument | null>(null)
  const documentRef = useRef<HTMLElement>(null)
  const [confirm, setConfirm] = useState<{ collection: KnowledgeView; kind: 'remove' | 'prune' } | null>(null)
  const native = !!window.workflowDesktop?.knowledge
  const refresh = useCallback(async () => { const result = knowledgeListSchema.parse(await knowledgeRequest({ kind: 'list', profileId })); setCollections(result.collections); setDamaged(result.damaged) }, [profileId])
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (error) { setError(error instanceof Error ? error.message : 'Операция не выполнена.') } finally { setBusy(false) }
  }
  useEffect(() => { if (native) void refresh().catch(error => setError(String(error))) }, [refresh, native])
  useEffect(() => { if (document) documentRef.current?.scrollIntoView({ block: 'start' }) }, [document])
  const start = (collection: KnowledgeView | null) => {
    setEditing(collection); setSourcePath(collection?.sourcePath ?? ''); setLabel(collection?.label ?? 'SOAR · актуальная база'); setSelected(collection?.selectedPaths ?? [])
    setScan(null); setPreview(null); setConsent(false); setShowImport(true); setDocument(null); setConfirm(null)
  }
  const loadScan = async (path: string) => {
    const next = knowledgeScanSchema.parse(await knowledgeRequest({ kind: 'scan', sourcePath: path }))
    setSourcePath(next.sourcePath); setScan(next); setPreview(null); setConsent(false)
    setSelected(editing ? [...editing.selectedPaths] : next.files.filter(file => file.recommended).map(file => file.path))
  }
  return <Modal title="Знания SOAR" close={busy ? () => {} : close} wide className="knowledge-dialog">
    <section className="knowledge-intro"><span className="knowledge-eyebrow">LOCAL KNOWLEDGE · 0.5.3</span><h3>Знания остаются рядом</h3><p>Профиль «{profileName}». Подключите папку один раз и сохраняйте проверенные версии. Источник остаётся у вас, рабочий снимок доступен без интернета.</p><p className="knowledge-boundary">Чтобы модель использовала базу, выберите коллекции в узле Agent → «Знания агента». Перед запуском можно проверить поиск без ИИ. Пакет источников сохраняется в истории Run; подключение папки само по себе не добавляет её во все запросы.</p></section>
    {!native ? <p role="status">Подключение локальных папок доступно в Windows-приложении. Откройте установленную версию Workflow Architect.</p> : <>
      <div className="knowledge-actions"><button disabled={busy} onClick={() => start(null)}>Подключить папку</button><button disabled={busy} onClick={() => void perform(async () => { const id = await knowledgeRequest({ kind: 'restore', profileId }); if (id) { await refresh(); setNotice('Копия восстановлена отдельной коллекцией. Разрешите использование и заново выберите папку для обновлений.') } })}>Восстановить копию</button><button disabled={busy} onClick={() => void perform(refresh)}>Обновить список</button></div>
      {error && <p role="alert" className="knowledge-error">{error}</p>}{notice && <p role="status">{notice}</p>}{busy && <p role="status">Проверяем и сохраняем…</p>}
      {damaged > 0 && <p role="alert" className="knowledge-error">Обнаружены повреждённые записи: {damaged}. Они не используются. Восстановите резервную копию; повреждённые файлы сохранены для диагностики.</p>}
      {showImport && <section className="knowledge-step" aria-label="Подключение базы">
        <div className="knowledge-heading"><h3>01 · Источник и разрешённые документы</h3><button disabled={busy} onClick={() => { setShowImport(false); setPreview(null) }}>Отменить подключение</button></div>
        <label>Название коллекции<input value={label} maxLength={80} disabled={busy || !!preview} onChange={event => setLabel(event.target.value)} /></label>
        <label>Папка источника<input placeholder="Выберите soar-team-content" value={sourcePath} disabled={busy || !!preview} onChange={event => { setSourcePath(event.target.value); setScan(null) }} /></label>
        <div className="knowledge-actions"><button disabled={busy} onClick={() => void perform(async () => { const path = await knowledgeRequest({ kind: 'choose-folder' }); if (typeof path === 'string') await loadScan(path) })}>Выбрать папку…</button><button disabled={busy || !sourcePath} onClick={() => void perform(() => loadScan(sourcePath))}>Прочитать список файлов</button></div>
        <p>Разрешены Markdown и JSON из source/current, source/knowledge, docs и входные файлы базы. Архивы, отзывы с атрибуцией, коммерческие, персональные и служебные разделы исключены. Тексты не исполняются; ссылки внутри документов автоматически не загружаются.</p>
        {scan && <><p>Доступно {scan.files.length} · выбрано {selected.length} · исключено файлов/разделов {scan.excluded}. Новые документы выбираются вручную. Максимум 200 документов, 512 КБ на файл и 6 МБ на снимок.</p>
          <div className="knowledge-files">{scan.files.map(file => <label key={file.path}><input type="checkbox" checked={selected.includes(file.path)} disabled={busy || !!preview} onChange={event => setSelected(event.target.checked ? [...selected, file.path] : selected.filter(path => path !== file.path))} /><span>{file.path}</span>{file.recommended && <small>основа</small>}</label>)}</div>
          {selected.some(path => !scan.files.some(file => file.path === path)) && <p>Ранее выбранные отсутствующие документы будут показаны в удалениях предпросмотра.</p>}
          <button disabled={busy || !selected.length || !label.trim()} onClick={() => void perform(async () => { setPreview(knowledgePreviewSchema.parse(await knowledgeRequest({ kind: 'prepare', profileId, ...(editing ? { id: editing.id, revision: editing.revision } : {}), label, sourcePath, selectedPaths: selected }))); setConsent(false) })}>Подготовить снимок</button>
        </>}
        {preview && <section className="knowledge-preview"><h3>02 · Проверить и сохранить</h3><p>Версия источника: <strong>{preview.snapshot.sourceVersion}</strong> · {preview.snapshot.documents.length} документов. Предпросмотр действует до {date(preview.expiresAt)}.</p>
          <p>Добавлено {preview.added.length} · изменено {preview.changed.length} · удалено {preview.removed.length}</p>
          <details><summary>Изменения по файлам</summary>{(['added', 'changed', 'removed'] as const).map((kind, index) => <div key={kind}><strong>{['Добавлено', 'Изменено', 'Удалено'][index]}</strong><ul>{preview[kind].map(path => <li key={path}>{path}</li>)}</ul></div>)}</details>
          <div className="knowledge-files">{preview.snapshot.documents.map(doc => <button key={doc.id} disabled={busy} onClick={() => void perform(async () => setDocument(knowledgeDocumentSchema.parse(await knowledgeRequest({ kind: 'preview-document', profileId, token: preview.token, documentId: doc.id }))))}>{doc.path} · просмотр</button>)}</div>
          <label className="knowledge-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />Я проверил выбор: здесь нет секретов и персональных данных; разрешаю хранить эти знания в данном профиле.</label>
          <button disabled={busy || !consent} onClick={() => void perform(async () => { await knowledgeRequest({ kind: 'commit', profileId, token: preview.token }); await refresh(); setPreview(null); setShowImport(false); setDocument(null); setNotice('Снимок сохранён. Обновляйте его после изменений исходной базы.') })}>Сохранить этот снимок</button>
        </section>}
      </section>}
      {!collections.length && !showImport && <div className="knowledge-empty"><h3>База пока не подключена</h3><p>Начните с папки soar-team-content. Подключение не меняет файлы SOAR и не отправляет их в облако.</p></div>}
      {collections.map(collection => <article className="knowledge-collection" key={collection.id} aria-label={collection.label}>
        <div className="knowledge-heading"><h3>{collection.label}</h3><span>{collection.enabled ? 'Доступ разрешён' : 'Доступ закрыт'}</span></div>
        <p className="knowledge-location">{collection.sourcePath || 'Восстановленная копия · источник не подключён'}</p>
        <p>{collection.sourceAvailable ? 'Папка доступна. Изменения подхватываются через «Обновить снимок».' : 'Источник недоступен. Сохранённые знания остаются на этом компьютере.'}</p>
        <div className="knowledge-actions"><button disabled={busy} onClick={() => start(collection)}>Обновить снимок</button><button disabled={busy} onClick={() => void perform(async () => { await knowledgeRequest({ kind: 'enable', profileId, id: collection.id, revision: collection.revision, enabled: !collection.enabled }); setDocument(null); await refresh() })}>{collection.enabled ? 'Отозвать доступ' : 'Разрешить использование'}</button><button disabled={busy} onClick={() => void perform(async () => { if (await knowledgeRequest({ kind: 'backup', profileId, id: collection.id })) setNotice('Резервная копия сохранена. Это открытый JSON с текстами базы; храните его локально.') })}>Сохранить копию…</button><button disabled={busy} onClick={() => setConfirm({ collection, kind: 'remove' })}>Удалить коллекцию…</button></div>
        <p className="knowledge-caption">Резервная копия содержит тексты без шифрования. Она не включает путь к источнику. Хранятся последние три снимка; более старые удаляются при обновлении.</p>
        {collection.snapshots.map((snapshot, index) => <details key={snapshot.id} open={index === 0} className="knowledge-snapshot"><summary>{index === 0 ? 'Текущий снимок' : 'История · не используется как текущая'} · {snapshot.sourceVersion} · {date(snapshot.createdAt)} · {snapshot.documents.length} документов</summary><p className="knowledge-caption">SHA256 {snapshot.digest}<br />Снимок {snapshot.id}</p><div className="knowledge-files">{snapshot.documents.map(doc => <button disabled={busy || !collection.enabled} key={doc.id} onClick={() => void perform(async () => setDocument(knowledgeDocumentSchema.parse(await knowledgeRequest({ kind: 'inspect', profileId, id: collection.id, snapshotId: snapshot.id, documentId: doc.id }))))}>{doc.path}<small>{doc.facts.length} записей · {Math.ceil(doc.bytes / 1024)} КБ</small></button>)}</div></details>)}
        {collection.snapshots.length > 1 && <button disabled={busy} onClick={() => setConfirm({ collection, kind: 'prune' })}>Удалить старые снимки…</button>}
      </article>)}
      {confirm && <section className="knowledge-step" role="alert"><h3>{confirm.kind === 'remove' ? 'Удалить коллекцию и её историю?' : 'Удалить историю, оставив текущий снимок?'}</h3><p>«{confirm.collection.label}». Исходные файлы SOAR останутся на месте. Для возврата удалённых снимков понадобится резервная копия.</p><button disabled={busy} onClick={() => void perform(async () => { await knowledgeRequest({ kind: confirm.kind, profileId, id: confirm.collection.id, revision: confirm.collection.revision }); setConfirm(null); setDocument(null); await refresh() })}>Подтвердить удаление</button><button disabled={busy} onClick={() => setConfirm(null)}>Отмена</button></section>}
      {document && <section ref={documentRef} className="knowledge-document" aria-label="Просмотр документа"><div className="knowledge-heading"><h3>{document.path}</h3><button onClick={() => setDocument(null)}>Закрыть документ</button></div><p className="knowledge-caption">ID {document.id}<br />SHA256 {document.hash}</p><p>Область и согласование показаны только из явных полей. «Не указано» означает неизвестное; согласование не заменяет доказательство свойства.</p>{document.facts.length > 0 && <details><summary>Исходные ID, SKU и область утверждений ({document.facts.length})</summary><div className="knowledge-facts">{document.facts.map((fact, index) => <p key={index}><strong>{fact.sourceId}</strong> · SKU {fact.sku ?? 'не указан'}<br />Согласование: {fact.approval ?? 'не указано'}<br />Область: {fact.scope ?? 'не указана'}</p>)}</div></details>}<pre>{document.content}</pre></section>}
    <MediaLibrary key={profileId} profileId={profileId} />
    </>}
  </Modal>
}
