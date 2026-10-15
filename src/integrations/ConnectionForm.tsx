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

import { useEffect, useState } from 'react'
import { z } from 'zod'
import { credentialViewSchema, type CredentialView } from '../credentials/schema'
import { createId } from '../domain/factories'
import type { Profile } from '../profiles/schema'
import { integrationRequest } from './client'
import { integrationConnectionSchema, type IntegrationConnection, type ConnectionSettings } from './schema'

export const connectorLabels = { telegram: 'Telegram · сообщения и файлы', 'http-json': 'HTTP / JSON · веб-сервис', 'local-files': 'Файлы · папка статей', 'mcp-filesystem': 'MCP · файловые инструменты' }
export function ConnectionForm({ profileId, saved }: { profileId: Profile['id']; saved(): void }) {
  const [kind, setKind] = useState<Exclude<ConnectionSettings['kind'], 'telegram'>>('http-json'), [label, setLabel] = useState('Мой сервис'), [credentialId, setCredentialId] = useState(''), [root, setRoot] = useState(''), [baseUrl, setBaseUrl] = useState(''), [auth, setAuth] = useState<'none' | 'bearer' | 'header'>('none'), [header, setHeader] = useState('X-API-Key'), [write, setWrite] = useState(false)
  const [credentials, setCredentials] = useState<CredentialView[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void window.workflowDesktop?.credentials?.request({ kind: 'list', profileId }).then(value => {
      const reply = z.object({ ok: z.boolean(), value: z.unknown().optional() }).parse(value)
      if (!reply.ok) throw new Error('Не удалось получить список сохранённых секретов.')
      const rows = z.array(credentialViewSchema).parse(reply.value).filter(item => item.profileId === profileId && item.enabled && item.available)
      if (active) setCredentials(rows)
    }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [profileId])
  const submit = async () => {
    setBusy(true); setError('')
    try {
      const settings: ConnectionSettings = kind === 'http-json' ? { kind, baseUrl, authentication: auth, credentialId: auth === 'none' ? null : credentialId, headerName: header, allowWrites: write } : kind === 'local-files' ? { kind, root, allowWrites: write } : { kind, root, tools: [] }
      const connection = integrationConnectionSchema.parse({ version: '0.5', id: createId(), profileId, revision: 0, enabled: true, label, settings })
      await integrationRequest({ action: 'save', connection }); saved()
    } catch (error) { setError(error instanceof z.ZodError ? 'Проверьте название, путь и выбор сохранённого подключения.' : error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <form className="integration-form" onSubmit={event => { event.preventDefault(); void submit() }}>
    <h3>Новое подключение</h3>
    <label>Сервис<select aria-label="Сервис" value={kind} onChange={event => { setKind(event.target.value as typeof kind); setWrite(false) }}>{Object.entries(connectorLabels).filter(([id]) => id !== 'telegram').map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label>Название<input required maxLength={100} value={label} onChange={event => setLabel(event.target.value)} /></label>
    {kind === 'http-json' && <><label>Базовый адрес HTTPS<input required type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://service.example/api/" /></label><label>Авторизация<select value={auth} onChange={event => setAuth(event.target.value as typeof auth)}><option value="none">Без авторизации</option><option value="bearer">Bearer token</option><option value="header">API key в заголовке</option></select></label>{auth === 'header' && <label>Имя заголовка<input value={header} onChange={event => setHeader(event.target.value)} /></label>}</>}
    {(kind === 'http-json' && auth !== 'none') && <label>Сохранённый секрет<select required value={credentialId} onChange={event => setCredentialId(event.target.value)}><option value="">Выберите из защищённых подключений</option>{credentials.map(item => <option key={item.id} value={item.id}>{item.label} · {item.service}</option>)}</select><small>Токен добавляется в «Защищённых подключениях». Здесь используется только его ссылка.</small></label>}
    {(kind === 'local-files' || kind === 'mcp-filesystem') && <label>Разрешённая папка<input aria-label="Разрешённая папка" required value={root} onChange={event => setRoot(event.target.value)} placeholder="D:\Articles" /><small>Укажите существующую папку. Доступ к соседним папкам и ссылкам закрыт.</small></label>}
    {(kind === 'local-files' || kind === 'http-json') && <label className="integration-check"><input type="checkbox" checked={write} onChange={event => setWrite(event.target.checked)} />{kind === 'local-files' ? 'Разрешить создание и изменение файлов' : 'Разрешить POST, PUT, PATCH и DELETE'}</label>}
    {kind === 'mcp-filesystem' && <p className="muted">После сохранения нажмите «Проверить», изучите инструменты и разрешите нужные. По умолчанию ни один инструмент не разрешён.</p>}
    {error && <p role="alert" className="field-error">{error}</p>}<button disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Создать подключение'}</button>
  </form>
}
export function McpGrants({ connection, tools, changed }: { connection: IntegrationConnection; tools: { name: string; description: string; schemaHash: string; inputSchema: unknown }[]; changed(): void }) {
  const settings = connection.settings
  const [selected, setSelected] = useState<string[]>(settings.kind === 'mcp-filesystem' ? settings.tools.map(tool => tool.name) : []), [error, setError] = useState('')
  if (settings.kind !== 'mcp-filesystem') return null
  return <div className="integration-grants"><h4>Разрешения инструментов</h4>{tools.map(tool => <div key={tool.name}><label className="integration-check"><input type="checkbox" checked={selected.includes(tool.name)} onChange={event => setSelected(values => event.target.checked ? [...values, tool.name] : values.filter(name => name !== tool.name))} /><strong>{tool.name}</strong></label><details><summary>Описание и входной контракт</summary><p>{tool.description}</p><pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></details></div>)}<button onClick={() => { void integrationRequest({ action: 'save', connection: { ...connection, settings: { ...settings, tools: tools.filter(tool => selected.includes(tool.name)).map(({ name, schemaHash }) => ({ name, schemaHash })) } } }).then(changed).catch(error => setError(String(error))) }}>Сохранить разрешения</button>{error && <p role="alert">{error}</p>}</div>
}
