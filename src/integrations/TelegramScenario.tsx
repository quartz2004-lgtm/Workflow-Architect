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

import { useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import type { Profile } from '../profiles/schema'
import type { Autosave } from '../persistence/autosave'
import { switchProject } from '../persistence/switch-project'
import { createTelegramArticleExample } from '../execution/article-example'
import { createTelegramHumanExample } from '../execution/telegram-example'
import { integrationRequest } from './client'
import { checkTelegramWorkflow } from './telegram-preflight'
import { publishedWorkflowSchema, type PublishedWorkflow, type TelegramBinding } from './source-schema'
import type { IntegrationState } from './protocol'

export function TelegramScenario({ profileId, binding, workflows, permittedModel, autosave, refresh }: { profileId: Profile['id']; binding: TelegramBinding; workflows: IntegrationState['workflows']; permittedModel: string | null; autosave: Autosave; refresh(): Promise<void> }) {
  const editor = useEditor(), project = useStore(editor.projectStore, state => state.project)
  const [active, setActive] = useState<PublishedWorkflow | null>(null), [entry, setEntry] = useState(''), [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const entries = project.nodes.filter(node => node.type === 'trigger' && ['manual', 'telegram-message'].includes(node.operation?.kind ?? ''))
  const selectedEntry = entries.some(node => node.id === entry) ? entry : entries[0]?.id ?? ''
  const preflight = useMemo(() => selectedEntry ? checkTelegramWorkflow(project, selectedEntry, permittedModel) : null, [project, selectedEntry, permittedModel])
  const enabled = workflows.some(item => item.id === binding.workflowId && item.enabled)
  useEffect(() => {
    let alive = true
    if (binding.workflowId && enabled) void integrationRequest({ action: 'workflow-details', profileId, id: binding.workflowId }).then(value => { if (alive) setActive(publishedWorkflowSchema.parse(value)) }).catch(error => { if (alive) { setActive(null); setError(String(error)) } })
    return () => { alive = false }
  }, [profileId, binding.workflowId, enabled])
  const current = enabled && active?.id === binding.workflowId ? active : null
  const sameProject = current?.project.project.id === project.project.id
  const differs = sameProject && JSON.stringify(current?.project) !== JSON.stringify(project)
  const act = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await work(); await refresh() } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <section className="integration-card telegram-scenario">
    <h3>3. Сценарий для этого чата</h3>
    <div className="telegram-active" role="status"><small>СЕЙЧАС В TELEGRAM</small><strong>{current?.label ?? (binding.workflowId ? enabled ? error ? 'Не удалось загрузить сценарий. Закройте и откройте окно повторно.' : 'Загружаем активный сценарий…' : 'Прежняя версия отключена. Включите сценарий ниже.' : 'Сценарий ещё не включён')}</strong>{current && <span>Версия от {new Date(current.createdAt).toLocaleString('ru-RU')}</span>}</div>
    {differs && <p className="telegram-warning">На Canvas есть изменения. В Telegram продолжает работать предыдущая версия. Обновите её кнопкой ниже, когда изменения готовы.</p>}
    <p>На Canvas: <strong>{project.project.name}</strong></p>
    {entries.length > 1 && <label>Вход сценария<select value={selectedEntry} onChange={event => setEntry(event.target.value)}>{entries.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>}
    {!entries.length && <p className="muted">В проекте нет подходящего входа. Начните с готового сценария ниже.</p>}
    {preflight?.errors.map(message => <p key={message} className="field-error">{message}</p>)}
    {!!preflight?.warnings.length && <details><summary>Что нужно проверить пробным запуском</summary>{preflight.warnings.map(message => <p key={message} className="muted">{message}</p>)}</details>}
    {current && !sameProject && <p className="muted">Включение проекта с Canvas заменит «{current.label}» только для этого чата. Уже начатые задачи продолжат работу.</p>}
    <button className="primary" disabled={busy || !preflight?.ok || sameProject && !differs && current?.entryNodeId === selectedEntry} onClick={() => { void act(async () => {
      await autosave.flush()
      if (autosave.statusStore.getState().status !== 'saved') throw new Error('Сначала сохраните изменения проекта.')
      await integrationRequest({ action: 'activate', profileId, bindingId: binding.id, expectedWorkflowId: binding.workflowId, project, entryNodeId: selectedEntry, label: project.project.name.slice(0, 100) })
      setNotice('Сценарий включён для этого чата. Новые сообщения используют эту версию.')
    }) }}>{sameProject && !differs && current?.entryNodeId === selectedEntry ? 'Эта версия уже активна' : current ? 'Подтвердить и обновить сценарий чата' : 'Включить для этого чата'}</button>
    <details className="telegram-templates"><summary>Начать с готового сценария</summary><p className="muted">Откроется новый проект; текущий будет сохранён. После просмотра нажмите «Включить для этого чата».</p><div className="inline-actions"><button disabled={busy} onClick={() => { void act(() => switchProject(editor, autosave, createTelegramArticleExample())) }}>Статьи и правки · нужна Ollama</button><button disabled={busy} onClick={() => { void act(() => switchProject(editor, autosave, createTelegramHumanExample())) }}>Подтверждение и файл · без ИИ</button></div></details>
    <details><summary>Выбрать ранее опубликованную версию</summary><label>Опубликованный сценарий<select value={choice} onChange={event => setChoice(event.target.value)}><option value="">Выберите сценарий</option>{workflows.filter(item => item.enabled).map(item => <option key={item.id} value={item.id}>{item.label} · {new Date(item.createdAt).toLocaleString()}</option>)}</select></label><button disabled={busy || !choice} onClick={() => { void act(async () => { await integrationRequest({ action: 'select-workflow', profileId, bindingId: binding.id, workflowId: choice, expectedWorkflowId: binding.workflowId }); setNotice('Активный сценарий изменён.') }) }}>Подтвердить выбор для этого чата</button></details>
    {enabled && <section className="telegram-test"><h4>4. Проверьте связь</h4><p className="muted">Отправим сообщение с названием активного сценария и кнопками управления. В Telegram нажмите «Новый текст», затем отправьте задачу.</p><button disabled={busy} onClick={() => { void act(async () => { await integrationRequest({ action: 'test-chat', profileId, id: binding.id }); setNotice('Telegram подтвердил отправку тестового сообщения. Откройте чат и запустите пробную задачу.') }) }}>Отправить тестовое сообщение</button></section>}
    {error && <p role="alert" className="field-error">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>
}
