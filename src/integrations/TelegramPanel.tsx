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
import type { Profile } from '../profiles/schema'
import type { Autosave } from '../persistence/autosave'
import type { IntegrationState } from './protocol'
import { integrationRequest } from './client'
import { TelegramBotSetup } from './TelegramBotSetup'
import { TelegramScenario } from './TelegramScenario'

const botSchema = z.object({ username: z.string(), is_bot: z.literal(true) })
const pairSchema = z.object({ username: z.string(), code: z.string(), expiresAt: z.number() })
export function TelegramPanel({ profile, state, refresh, autosave }: { profile: Profile; state: IntegrationState | null; refresh(): Promise<void>; autosave: Autosave }) {
  const [selected, setSelected] = useState(''), [adding, setAdding] = useState(false)
  const [checked, setChecked] = useState<{ id: string; revision: number; username: string } | null>(null)
  const [pair, setPair] = useState<(z.infer<typeof pairSchema> & { connectionId: string }) | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const connections = state?.connections.filter(item => item.settings.kind === 'telegram') ?? []
  const connection = connections.find(item => item.id === selected) ?? connections[0]
  const bindings = state?.telegram.bindings.filter(item => item.connectionId === connection?.id) ?? []
  const verified = checked?.id === connection?.id && checked?.revision === connection?.revision
  const listening = state?.telegram.problems.find(item => item.connectionId === connection?.id)?.listening
  const connectionId = connection?.id, connectionRevision = connection?.revision, connectionEnabled = connection?.enabled
  useEffect(() => {
    let alive = true
    if (connectionId && connectionEnabled && connectionRevision !== undefined) {
      void integrationRequest({ action: 'check', profileId: profile.id, id: connectionId }).then(value => {
        const bot = botSchema.parse(value)
        if (alive) setChecked({ id: connectionId, revision: connectionRevision, username: bot.username })
      }).catch(error => { if (alive) setError(error instanceof Error ? error.message : 'Бот не ответил. Проверьте подключение.') })
    }
    return () => { alive = false }
  }, [profile.id, connectionId, connectionRevision, connectionEnabled])
  const act = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await work(); await refresh() } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  if (!state) return <p role="status">Открываем настройки Telegram…</p>
  return <section className="telegram-panel" aria-label="Настройка Telegram">
    <header className="telegram-heading"><div><h2>Telegram для ваших задач</h2><p className="muted">Профиль: <strong>{profile.name}</strong>. Подключите бота, привяжите личный чат и включите сценарий.</p></div>{connections.length > 0 && <button onClick={() => setAdding(value => !value)}>{adding ? 'К подключённым ботам' : 'Добавить бота'}</button>}</header>
    <ol className="telegram-progress" aria-label="Этапы настройки"><li>1 · Бот</li><li>2 · Личный чат</li><li>3 · Сценарий</li><li>4 · Проверка</li></ol>
    {adding || !connection ? <TelegramBotSetup profileId={profile.id} connected={value => { setSelected(value.id); setAdding(false); void act(refresh) }} /> : <>
      {connections.length > 1 && <label>Бот<select value={connection.id} onChange={event => { setSelected(event.target.value); setError(''); setNotice('') }}>{connections.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <details className="telegram-connection" open={!bindings.length}><summary>{bindings.length ? `✓ Бот и личный чат подключены · ${verified && checked ? `@${checked.username}` : connection.label}` : '1–2 · Подключение бота и личного чата'}</summary>
      <section className="integration-card"><header><strong>{verified && checked ? `@${checked.username}` : connection.label}</strong><span>{!connection.enabled ? 'Отключён' : listening ? 'Слушает сообщения' : verified ? 'Бот проверен' : 'Подключение сохранено'}</span></header>
        <p className="muted">{connection.enabled ? 'Токен хранится в защищённом хранилище этого профиля.' : 'Использование бота отключено. Включите подключение, чтобы продолжить.'}</p>
        <div className="inline-actions"><button disabled={busy || !connection.enabled} onClick={() => { void act(async () => { const bot = botSchema.parse(await integrationRequest({ action: 'check', profileId: profile.id, id: connection.id })); setChecked({ id: connection.id, revision: connection.revision, username: bot.username }); setNotice('Telegram подтвердил подключение к боту.') }) }}>Проверить бота</button><button disabled={busy} onClick={() => { void act(async () => { await integrationRequest({ action: 'save', connection: { ...connection, enabled: !connection.enabled } }) }) }}>{connection.enabled ? 'Отключить бота' : 'Включить бота'}</button></div>
      </section>
      <section className="integration-card"><h3>2. Привяжите личный чат</h3><p className="muted">Команду должен отправить тот человек, который будет пользоваться профилем «{profile.name}».</p>
        {bindings.map(binding => <p key={binding.id}>✓ Личный чат <strong>{binding.chatId}</strong> привязан</p>)}
        <button disabled={busy || !connection.enabled} onClick={() => { void act(async () => { const result = pairSchema.parse(await integrationRequest({ action: 'pair', profileId: profile.id, id: connection.id })); setPair({ ...result, connectionId: connection.id }); setChecked({ id: connection.id, revision: connection.revision, username: result.username }) }) }}>{bindings.length ? 'Привязать другой личный чат' : 'Получить команду для привязки'}</button>
        {pair?.connectionId === connection.id && <div className="integration-pair"><p>Откройте <strong>@{pair.username}</strong> в Telegram и отправьте:</p><code>/start {pair.code}</code><button onClick={() => { void act(async () => { await navigator.clipboard.writeText(`/start ${pair.code}`); setNotice('Команда скопирована. Вставьте её в чат бота в Telegram.') }) }}>Скопировать команду</button><p className="muted">Действует до {new Date(pair.expiresAt).toLocaleTimeString()}. После отправки привязка появится здесь автоматически. Не пересылайте команду другим людям.</p></div>}
      </section>
      </details>
      {bindings.map(binding => <div key={binding.id} className="telegram-chat"><h3>Чат {binding.chatId} · {profile.name}</h3><TelegramScenario profileId={profile.id} binding={binding} workflows={state.workflows} autosave={autosave} refresh={refresh} /><details><summary>Отключение доступа к этому чату</summary><button disabled={busy} onClick={() => { void act(async () => { await integrationRequest({ action: 'remove-binding', profileId: profile.id, id: binding.id }) }) }}>Отозвать доступ чата</button></details></div>)}
    </>}
    {error && <p role="alert" className="field-error">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>
}
