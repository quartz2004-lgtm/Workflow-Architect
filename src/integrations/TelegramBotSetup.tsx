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
import { z } from 'zod'
import { createId } from '../domain/factories'
import { credentialRequest } from '../credentials/client'
import { credentialViewSchema, type CredentialView } from '../credentials/schema'
import type { Profile } from '../profiles/schema'
import { integrationRequest } from './client'
import type { IntegrationConnection } from './schema'

export function TelegramBotSetup({ profileId, connected }: { profileId: Profile['id']; connected(connection: IntegrationConnection): void }) {
  const [saved, setSaved] = useState<CredentialView[]>([]), [credentialId, setCredentialId] = useState('')
  const [mode, setMode] = useState<'token' | 'saved'>('token'), [label, setLabel] = useState('Мой Telegram')
  const [secret, setSecret] = useState(''), [grant, setGrant] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const created = useRef<{ credentialId: string; connection: IntegrationConnection } | null>(null)
  useEffect(() => {
    let alive = true
    void credentialRequest({ kind: 'list', profileId }).then(value => {
      const items = z.array(credentialViewSchema).parse(value).filter(item => item.profileId === profileId && item.enabled && item.available)
      if (alive) setSaved(items)
    }).catch(() => { if (alive) setError('Не удалось открыть защищённое хранилище. Повторно откройте настройки Telegram.') })
    return () => { alive = false }
  }, [profileId])
  const connect = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      if (!created.current) {
        let id = credentialId
        if (mode === 'token') {
          if (!grant) throw new Error('Разрешите приложению использовать этот токен.')
          const token = secret.trim()
          if (!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token)) throw new Error('Введите полный токен бота, полученный у BotFather.')
          id = createId()
          await credentialRequest({ kind: 'create', profileId, id, label, service: 'Telegram', secret: token, enabled: true })
          setSecret('')
        }
        if (!id) throw new Error('Выберите сохранённый секрет.')
        created.current = { credentialId: id, connection: { version: '0.5', id: createId(), profileId, label, enabled: true, revision: 0, settings: { kind: 'telegram', credentialId: id } } }
      }
      await integrationRequest({ action: 'save', connection: created.current.connection })
      connected(created.current.connection)
    } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось сохранить подключение.') }
    finally { setBusy(false) }
  }
  return <form className="integration-card telegram-setup" onSubmit={event => { event.preventDefault(); void connect() }}>
    <h3>1. Подключите бота</h3><p className="muted">Создайте бота в Telegram через @BotFather и вставьте его токен. Windows зашифрует секрет отдельно от ваших проектов.</p>
    <fieldset disabled={busy || created.current !== null}>
      <label>Название бота в приложении<input required maxLength={100} value={label} onChange={event => setLabel(event.target.value)} /></label>
      <label>Способ подключения<select value={mode} onChange={event => setMode(event.target.value as 'token' | 'saved')}><option value="token">Ввести токен бота</option><option value="saved">Использовать сохранённый секрет</option></select></label>
      {mode === 'token' ? <><label>Токен бота<input type="password" autoComplete="new-password" spellCheck={false} required value={secret} onChange={event => setSecret(event.target.value)} /></label><label className="integration-check"><input type="checkbox" checked={grant} onChange={event => setGrant(event.target.checked)} />Разрешить приложению использовать этого бота в текущем профиле</label></> : <label>Сохранённый секрет<select required value={credentialId} onChange={event => setCredentialId(event.target.value)}><option value="">Выберите подключение</option>{saved.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
    </fieldset>
    {error && <p role="alert" className="field-error">{error}</p>}
    <button className="primary" disabled={busy || !label.trim() || mode === 'token' && !grant}>{busy ? 'Сохраняем защищённое подключение…' : 'Сохранить и продолжить'}</button>
  </form>
}
