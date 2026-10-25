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
import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { graphEntries } from '../domain/graphs'
import { downloadBlob, downloadText } from '../shared/download'
import type { RunEvent } from './run-types'
import { BackgroundConsent, RuntimeControls } from './RuntimeControls'
import { HumanInput } from './HumanInput'
import { resolveContract } from './compiler'
import { runStatusLabels } from './view-state'
export { runStatusLabels } from './view-state'
import './run-panel.css'
import { articleBrief } from './article-example'
import { ContextPacketView } from '../knowledge/ContextPacketView'
import { EditorialRunView } from '../editorial/EditorialRunView'
import { editorialKnowledgeRequest, normalizeEditorialTask } from '../editorial/schema'
import { useProfile } from '../profiles/context'
import { knowledgeRequest } from '../knowledge/client'
import { contextPacketSchema, type ContextPacket } from '../knowledge/context'

const eventLabels = { editorial: 'Редакционный этап и версии', knowledge: 'Пакет источников Agent', ai: 'Вызов ИИ / инструмента', status: 'Статус', 'step-start': 'Вход узла', 'step-finish': 'Результат узла', 'human-request': 'Вопрос человеку', 'human-answer': 'Ответ человека', artifact: 'Артефакт', failure: 'Ошибка' }
const stringify = (value: unknown) => JSON.stringify(value, null, 2)
const preview = (value: unknown) => { const text = stringify(value); return text.length > 20000 ? `${text.slice(0, 20000)}\n… Предпросмотр сокращён. Сохраните журнал для полного значения.` : text }
function eventContent(event: RunEvent) {
  if (event.kind === 'editorial') return event.state
  if (event.kind === 'knowledge') return event.packet
  if (event.kind === 'ai') return event.trace
  if (event.kind === 'step-start') return { input: event.input, data: event.data }
  if (event.kind === 'step-finish') return { output: event.output, ports: event.ports }
  if (event.kind === 'status') return runStatusLabels[event.status]
  if (event.kind === 'failure') return event.message
  if (event.kind === 'human-answer') return event.value
  if (event.kind === 'human-request') return event.request
  return { filename: event.artifact.filename, bytes: new TextEncoder().encode(event.artifact.content).byteLength }
}
export function RunPanel() {
  const editor = useEditor(), state = useStore(editor.runtime.store)
  const project = useStore(editor.projectStore, state => state.project)
  const entries = project.nodes.filter(node => node.type === 'trigger' && node.status !== 'disabled')
  const [entryId, setEntryId] = useState(entries[0]?.id ?? '')
  const [input, setInput] = useState(project.nodes.some(node => node.operation?.kind === 'agent') ? JSON.stringify(articleBrief, null, 2) : '{\n  "approved": true,\n  "text": "Workflow Architect"\n}'), [error, setError] = useState('')
  const [page, setPage] = useState<number | null>(null)
  const profile = useProfile()?.profile
  const [task, setTask] = useState(articleBrief.topic), [audience, setAudience] = useState(articleBrief.audience), [minimumWords, setMinimumWords] = useState(600)
  const [previousArticle, setPreviousArticle] = useState('')
  const [advancedInput, setAdvancedInput] = useState(false), [dossier, setDossier] = useState<{ key: string; packet: ContextPacket } | null>(null), [previewBusy, setPreviewBusy] = useState(false)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => { close.current?.focus() }, [])
  const active = ['queued', 'running', 'waiting'].includes(state.status)
  const busy = active || state.actionPending
  const selected = entries.some(node => node.id === entryId) ? entryId : entries[0]?.id ?? ''
  const editorialNode = project.nodes.find(node => node.operation?.kind === 'agent' && node.operation.editorial && project.edges.some(edge => edge.type === 'flow' && edge.sourceNode === selected && edge.targetNode === node.id))
  const dossierKey = JSON.stringify([profile?.id, project.project.id, editorialNode, task, audience, minimumWords, previousArticle])
  const latestEditorial = state.events.findLast(event => event.kind === 'editorial')
  const editorialAnswer = state.events.findLast(event => event.kind === 'human-answer')
  const editorialDecision = editorialAnswer?.kind === 'human-answer' ? editorialAnswer.value === true ? 'approved' : 'rejected' : state.status === 'waiting' ? 'waiting' : undefined
  const start = () => {
    if (!editorialNode || advancedInput) { parse(input, value => { setPage(null); editor.runtime.start(project, selected, value) }); return }
    try { const value = normalizeEditorialTask({ text: task, audience, minimumWords, ...(previousArticle ? { previousArticle } : {}) }); setError(''); setPage(null); editor.runtime.start(project, selected, value) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
  }
  const previewDossier = async () => {
    if (!profile || editorialNode?.operation?.kind !== 'agent' || !editorialNode.operation.knowledge) return
    setPreviewBusy(true); setError(''); setDossier(null)
    try {
      const value = normalizeEditorialTask({ text: task, audience, minimumWords, ...(previousArticle ? { previousArticle } : {}) })
      const request = editorialKnowledgeRequest(value)
      setDossier({ key: dossierKey, packet: contextPacketSchema.parse(await knowledgeRequest({ kind: 'context-preview', profileId: profile.id, settings: { ...editorialNode.operation.knowledge, query: editorialNode.operation.knowledge.query || request.query }, task: request.task })) })
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setPreviewBusy(false) }
  }
  const nodes = state.snapshot ? graphEntries(state.snapshot).flatMap(entry => entry.graph.nodes) : []
  const humanNode = nodes.find(node => node.id === state.human?.activation.nodeId)
  let humanSchema: unknown
  if (humanNode?.type === 'human' && humanNode.config.response && state.snapshot) {
    try { humanSchema = resolveContract(humanNode.config.response, state.snapshot) } catch { humanSchema = false }
  }
  const label = (id: string) => nodes.find(node => node.id === id)?.title ?? id
  const currentProject = state.snapshot?.project.id === project.project.id
  const lastPage = Math.max(0, Math.ceil(state.events.length / 50) - 1), currentPage = Math.min(page ?? lastPage, lastPage)
  const parse = (text: string, action: (value: unknown) => void) => { try { action(JSON.parse(text)); setError('') } catch (error) { setError(error instanceof Error ? error.message : String(error)) } }
  return <section className="run-panel" aria-label="Локальное выполнение">
    <header className="run-heading"><div><span className="eyebrow">LOCAL RUN · 0.5.3</span><h2>{runStatusLabels[state.status]}</h2></div><button ref={close} aria-label="Скрыть Run" onClick={() => editor.runtime.store.setState({ open: false })}>×</button></header>
    <div className="run-body">
      <p className="muted">Локально · без облачного ИИ. Обычные сценарии — до 5 минут; редакция имеет отдельный конечный бюджет и ожидание подтверждения, весь запуск — до двух часов. {editor.runtime.native ? 'История сохраняется на компьютере. Полный выход через tray прерывает выполнение с сохранением контрольной точки.' : 'В браузере закрытие вкладки прервёт запуск; история доступна до перезагрузки.'}</p>
      {editor.runtime.native && (editorialNode || latestEditorial ? <details><summary>История запусков и фоновая работа</summary><RuntimeControls runtime={editor.runtime} native={editor.runtime.native} /></details> : <RuntimeControls runtime={editor.runtime} native={editor.runtime.native} />)}
      {latestEditorial?.kind === 'editorial' && editor.runtime.native && !active && <div className="inline-actions">
        <button disabled={state.actionPending || !currentProject || !latestEditorial.state.versions.length} onClick={() => {
          setPreviousArticle(latestEditorial.state.versions.at(-1)!.text); setTask(''); setAudience(latestEditorial.state.task.audience); setMinimumWords(latestEditorial.state.task.minimumWords); setDossier(null); setAdvancedInput(false); setError(''); editor.runtime.native!.newRun()
        }}>Доработать этот текст</button>
        <button disabled={state.actionPending} onClick={() => { setPreviousArticle(''); setTask(''); setDossier(null); setAdvancedInput(false); setError(''); editor.runtime.native!.newRun() }}>Новое задание</button>
      </div>}
      {(!editor.runtime.native || !state.jobId) && <div className="run-start"><label>Ручной Trigger<select aria-label="Ручной Trigger" disabled={busy} value={selected} onChange={event => setEntryId(event.target.value)}>{!entries.length && <option value="">Добавьте Trigger на Canvas</option>}{entries.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
        {editorialNode && <>
          <label>Что подготовить?<textarea disabled={busy} value={task} onChange={event => { setTask(event.target.value); setDossier(null) }} rows={4} placeholder="Тема статьи, цель и пожелания к тексту" /></label>
          <label>Для кого текст<input disabled={busy} value={audience} onChange={event => { setAudience(event.target.value); setDossier(null) }} /></label>
          <label>Минимальный объём, слов<input type="number" min={100} max={5000} disabled={busy} value={minimumWords} onChange={event => { setMinimumWords(Number(event.target.value)); setDossier(null) }} /></label>
          {previousArticle && <section aria-label="Текст для доработки"><p className="muted">Эта задача создаст новую версию с новой проверкой. Прежнее одобрение не переносится.</p><details><summary>Исходный текст для правок</summary><pre>{previousArticle}</pre></details><button disabled={busy} onClick={() => { setPreviousArticle(''); setDossier(null) }}>Убрать исходный текст</button></section>}
          <button disabled={busy || previewBusy || !task.trim()} onClick={() => void previewDossier()}>{previewBusy ? 'Собираем досье…' : 'Посмотреть источники и фото для задания'}</button>
          {dossier?.key === dossierKey && <><p className="muted">Предварительный поиск без вызова ИИ. При запуске снимок фиксируется заново; точный пакет будет в истории.</p><ContextPacketView packet={dossier.packet} /></>}
          <label className="check-field"><input type="checkbox" checked={advancedInput} onChange={event => setAdvancedInput(event.target.checked)} disabled={busy} />Технический ввод JSON вместо формы</label>
        </>}
        {(!editorialNode || advancedInput) && <label>Вход запуска (JSON)<textarea aria-label="Вход запуска (JSON)" className="code-input" disabled={busy} value={input} onChange={event => setInput(event.target.value)} rows={3} spellCheck={false} /></label>}
        {editor.runtime.native && <BackgroundConsent native={editor.runtime.native} disabled={busy} runningAllowed={active ? state.backgroundAllowed : undefined} />}
        <div className="inline-actions"><button className="primary" disabled={busy || !selected || !state.available} onClick={start}>Запустить workflow</button><button disabled={!active || state.actionPending || !state.available} onClick={editor.runtime.cancel}>Остановить запуск</button></div>
      </div>}
      {state.snapshot && <p className="muted">Снимок: {state.snapshot.project.name}. Правки Canvas применятся при следующем запуске.{!currentProject && ' В редакторе открыт другой проект.'}</p>}
      {state.runId && <details><summary>Технические сведения запуска</summary><p className="run-identification muted">Run ID: <code>{state.runId}</code><br />План: <code>{state.planId}</code></p></details>}
      {latestEditorial?.kind === 'editorial' && <EditorialRunView state={latestEditorial.state} decision={editorialDecision} />}
      {(error || state.message) && <p className={error || ['failed', 'blocked', 'unknown'].includes(state.status) ? 'field-error' : 'muted'} role={error || ['failed', 'blocked', 'unknown'].includes(state.status) ? 'alert' : 'status'}>{error || state.message}</p>}
      {!!state.diagnostics.length && <details open={state.status === 'blocked'}><summary>Диагностика · {state.diagnostics.length}</summary><ul className="run-diagnostics">{state.diagnostics.map((issue, index) => <li key={index}><strong>{issue.severity === 'error' ? 'Ошибка' : 'Замечание'}</strong> · {issue.message} <button disabled={!currentProject} onClick={() => editor.focusEntity(issue.entityId)}>Показать узел</button></li>)}</ul></details>}
      {state.human && <section className="run-human" aria-label="Ответ человеку"><h3>{state.human.question}</h3><p className="muted">{label(state.human.activation.nodeId)} · до {new Date(state.human.expiresAt).toLocaleTimeString('ru-RU')}</p>
        {state.human.editorial && <><p><strong>Вы подтверждаете версию {state.human.editorial.number}</strong>. После отказа можно начать новую задачу с пожеланиями к правке; прежнее подтверждение не переносится.</p><pre>{state.human.editorial.text}</pre><details><summary>Точная версия</summary><pre>{state.human.editorial.id}{'\n'}SHA256 {state.human.editorial.digest}</pre></details></>}
        {state.human.mode === 'approval' ? <div className="inline-actions"><button disabled={!state.available || state.actionPending} onClick={() => editor.runtime.answer(state.human!.id, true)}>Подтвердить</button><button disabled={!state.available || state.actionPending} onClick={() => editor.runtime.answer(state.human!.id, false)}>Отклонить</button></div> : <HumanInput key={state.human.id} schema={humanSchema} disabled={!state.available || state.actionPending} submit={value => editor.runtime.answer(state.human!.id, value)} />}
        {state.answerError && <p className="field-error" role="alert">{state.answerError}</p>}
      </section>}
      {!!state.artifacts.length && <section aria-label="Артефакты запуска"><h3>Артефакты · {state.artifacts.length}</h3>{state.artifacts.map(artifact => <details className="run-artifact" key={artifact.id}><summary>{artifact.filename} · {label(artifact.activation.nodeId)}</summary><pre>{artifact.content.slice(0, 20000)}{artifact.content.length > 20000 ? '\n… Предпросмотр сокращён. Файл сохранится полностью.' : ''}</pre><button onClick={() => downloadBlob(artifact.filename, new Blob([artifact.content], { type: artifact.format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' }))}>Сохранить {artifact.filename}</button></details>)}</section>}
      <section aria-label="Журнал запуска"><div className="run-journal-heading"><h3>Журнал · {state.events.length}</h3><button disabled={!state.events.length} onClick={() => downloadText(`run-${state.runId}.json`, stringify({ runId: state.runId, planId: state.planId, status: state.status, message: state.message, events: state.events, outcome: state.outcome }))}>Сохранить журнал</button></div>
        {!state.events.length && <p className="muted">Здесь появятся входы, результаты и ошибки каждого выполненного шага.</p>}
        {state.events.slice(currentPage * 50, (currentPage + 1) * 50).map(event => <details className={`run-event run-event-${event.kind}`} key={event.sequence}><summary><span>{event.sequence.toString().padStart(2, '0')}</span> {eventLabels[event.kind]} · {'activation' in event && event.activation ? label(event.activation.nodeId) : event.kind === 'status' ? runStatusLabels[event.status] : ''}</summary>{event.kind === 'knowledge' ? <><p className="muted">Пакет подготовлен для этого запуска. Отправка модели отражается следующим событием «Вызов ИИ» этого узла.</p><ContextPacketView packet={event.packet} /></> : <pre>{preview(eventContent(event))}</pre>}{'activation' in event && event.activation && <p className="muted">Путь: {event.activation.path.map(label).join(' → ') || 'Корневой граф'} · call {event.activation.callId.slice(0, 8)}</p>}</details>)}
        {lastPage > 0 && <div className="inline-actions"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Предыдущие</button><span>{currentPage + 1} / {lastPage + 1}</span><button disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Следующие</button><button onClick={() => setPage(null)}>К последним</button></div>}
      </section>
    </div>
  </section>
}
