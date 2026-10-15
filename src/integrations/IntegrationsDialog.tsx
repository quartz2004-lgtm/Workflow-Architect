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

import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { Modal } from '../shared/Modal'
import { useProfile } from '../profiles/context'
import { useEditor } from '../app/context'
import { integrationRequest } from './client'
import { integrationStateSchema, type IntegrationState } from './protocol'
import { ConnectionForm, connectorLabels, McpGrants } from './ConnectionForm'
import './integrations.css'
import type { Autosave } from '../persistence/autosave'
import { TelegramPanel } from './TelegramPanel'

const toolsSchema = z.object({ tools: z.array(z.object({ name: z.string(), description: z.string(), schemaHash: z.string(), inputSchema: z.unknown() })) })
export function IntegrationsDialog({ close, autosave }: { close(): void; autosave: Autosave }) {
  const profile = useProfile()!.profile, editor = useEditor()
  const [state, setState] = useState<IntegrationState | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'telegram' | 'connections' | 'sources'>('telegram')
  const [tools, setTools] = useState<{ id: string; tools: z.infer<typeof toolsSchema>['tools'] } | null>(null)
  const [entry, setEntry] = useState(''), [workflow, setWorkflow] = useState(''), [interval, setIntervalMinutes] = useState(60), [input, setInput] = useState('{}')
  const refresh = useCallback(async () => { const parsed = integrationStateSchema.parse(await integrationRequest({ action: 'list', profileId: profile.id })); if (parsed.connections.some(item => item.profileId !== profile.id)) throw new Error('Неверный профиль подключения.'); setState(parsed) }, [profile.id])
  useEffect(() => { if (!window.workflowDesktop?.runtime) return; let active = true; const update = () => { if (active) void refresh().catch(error => { if (active) setError(String(error)) }) }; update(); const timer = setInterval(update, 3000); return () => { active = false; clearInterval(timer) } }, [refresh])
  const act = (work: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); setNotice(''); void work().then(refresh).catch(error => setError(error instanceof Error ? error.message : String(error))).finally(() => setBusy(false)) }
  const project = editor.projectStore.getState().project, entries = project.nodes.filter(node => node.type === 'trigger' && ['manual', 'telegram-message', 'schedule'].includes(node.operation?.kind ?? ''))
  if (!window.workflowDesktop?.runtime) return <Modal title="Интеграции" close={close}><h3>Подключения работают в Windows-приложении</h3><p>Telegram, HTTP/JSON, выбранные папки и MCP выполняются доверенным локальным сервисом. Здесь можно проектировать граф, настраивать поля Tool и экспортировать проект.</p></Modal>
  return <Modal wide className="integrations-dialog" title={`Интеграции · ${profile.name}`} close={close}>
    <p className="muted">Подключения и разрешения принадлежат профилю. Проект хранит только ссылки; токены и пути папок не попадают в экспорт.</p>
    <nav className="integration-tabs" aria-label="Разделы интеграций"><button aria-pressed={tab === 'telegram'} onClick={() => setTab('telegram')}>Telegram · начать здесь</button><button aria-pressed={tab === 'connections'} onClick={() => setTab('connections')}>Другие подключения</button><button aria-pressed={tab === 'sources'} onClick={() => setTab('sources')}>Расписание и публикации</button></nav>
    {tab === 'telegram' && <TelegramPanel profile={profile} state={state} refresh={refresh} autosave={autosave} />}
    {error && <p role="alert" className="field-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {tab === 'connections' && <div className="integration-columns"><section><h3>Подключения профиля</h3>{!state?.connections.some(connection => connection.settings.kind !== 'telegram') && <p className="muted">Создайте подключение и проверьте его перед запуском workflow.</p>}{state?.connections.filter(connection => connection.settings.kind !== 'telegram').map(connection => <article className="integration-card" key={connection.id}><header><strong>{connection.label}</strong><span>{connection.enabled ? 'Разрешено' : 'Отключено'}</span></header><p className="muted">{connectorLabels[connection.settings.kind]}</p><small className="integration-id">ID: {connection.id}</small><div className="inline-actions"><button disabled={busy || !connection.enabled} onClick={() => act(async () => { const result = await integrationRequest({ action: 'check', profileId: profile.id, id: connection.id }); const parsed = toolsSchema.safeParse(result); if (parsed.success) setTools({ id: connection.id, tools: parsed.data.tools }); setNotice('Подключение проверено.'); })}>Проверить</button><button disabled={busy} onClick={() => act(async () => { await integrationRequest({ action: 'save', connection: { ...connection, enabled: !connection.enabled } }) })}>{connection.enabled ? 'Отключить' : 'Включить'}</button></div>{tools?.id === connection.id && <McpGrants key={`${connection.id}:${connection.revision}`} connection={connection} tools={tools.tools} changed={() => { void refresh() }} />}</article>)}</section><ConnectionForm profileId={profile.id} saved={() => { void refresh() }} /></div>}
    {tab === 'sources' && <>
      <section className="integration-card"><h3>Опубликовать текущий workflow</h3><p className="muted">Сохраняется отдельная версия «{project.project.name}». Дальнейшие правки Canvas не изменят удалённые запуски. Для чата используйте раздел «Telegram · начать здесь»: там версия публикуется и включается одним действием с проверкой входных данных.</p><label>Входной Trigger<select value={entry} onChange={event => setEntry(event.target.value)}><option value="">Выберите вход</option>{entries.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label><button disabled={busy || !entry} onClick={() => act(async () => { await integrationRequest({ action: 'publish', profileId: profile.id, label: project.project.name.slice(0, 100), project, entryNodeId: entry }); setNotice('Версия опубликована. Теперь её можно выбрать для расписания. Настройка чата находится в разделе Telegram.') })}>Опубликовать для удалённых запусков</button></section>
      <section><h3>Опубликованные версии</h3>{state?.workflows.filter(item => item.enabled).map(item => <article className="integration-card" key={item.id}><strong>{item.label}</strong><p className="muted">{new Date(item.createdAt).toLocaleString()}</p><small className="integration-id">{item.id}</small><div className="inline-actions"><button disabled={busy} onClick={() => act(async () => { await integrationRequest({ action: 'disable-workflow', profileId: profile.id, id: item.id }); setNotice('Новые запуски этой публикации отключены. Уже запущенные задачи остаются в истории Run.') })}>Отключить новые запуски</button></div></article>)}</section>      <section className="integration-card"><h3>Расписание</h3><div className="integration-grid"><label>Workflow<select value={workflow} onChange={event => setWorkflow(event.target.value)}><option value="">Выберите опубликованный workflow</option>{state?.workflows.filter(item => item.enabled).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Каждые, минут<input type="number" min={1} max={525600} value={interval} onChange={event => setIntervalMinutes(Number(event.target.value))} /></label></div><label>Входные данные JSON<textarea value={input} onChange={event => setInput(event.target.value)} /></label><p className="muted">Работает, пока приложение запущено, в том числе в трее. После сна — один пропущенный запуск, без очереди за весь простой.</p><button disabled={busy || !workflow} onClick={() => act(async () => { await integrationRequest({ action: 'schedule', profileId: profile.id, workflowId: workflow, intervalMinutes: interval, input: JSON.parse(input) }); setNotice('Расписание включено.') })}>Включить расписание</button>{state?.schedules.map(item => <p key={item.id}>Каждые {item.intervalMinutes} мин · следующий {new Date(item.nextAt).toLocaleString()} <button onClick={() => act(async () => { await integrationRequest({ action: 'remove-schedule', profileId: profile.id, id: item.id }) })}>Удалить расписание</button>{item.problem && <span className="field-error">{item.problem}</span>}</p>)}</section>
    </>}
    {!!state?.telegram.problems.some(item => item.message) && <section aria-label="Проблемы подключений">{state.telegram.problems.filter(item => item.message).map(item => <p className="field-error" key={item.connectionId}>{item.message}</p>)}</section>}
    {!!state?.effects.length && <section><h3>Действия требуют сверки</h3><p>Сервис не подтвердил результат. Проверьте чат или файл перед новым запуском: автоматический повтор отключён.</p>{state.effects.map(item => <p key={item.id} className="integration-id">{item.key} · {item.status}</p>)}</section>}
    {!!state?.telegram.failures.length && <details><summary>Ошибки обработки сообщений · {state.telegram.failures.length}</summary>{state.telegram.failures.map(item => <p key={item.id}>{item.updateId}: {item.error}</p>)}</details>}
  </Modal>
}
