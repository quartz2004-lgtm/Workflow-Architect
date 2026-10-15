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
import { Modal } from '../shared/Modal'
import { useProfile } from '../profiles/context'
import { createId } from '../domain/factories'
import { FieldHelp } from '../help/FieldHelp'
import { credentialViewSchema, type CredentialView } from './schema'
import { credentialRequest as request } from './client'
import './credentials.css'

const statusSchema = z.strictObject({ available: z.boolean(), damaged: z.array(z.string()), unavailable: z.number().int().nonnegative() })
export function CredentialsDialog({ close }: { close(): void }) {
  const profile = useProfile()!.profile
  const [items, setItems] = useState<CredentialView[]>([]), [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState(''), [service, setService] = useState(''), [secret, setSecret] = useState(''), [enabled, setEnabled] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const refresh = async () => {
    const state = statusSchema.parse(await request({ kind: 'status' }))
    const records = z.array(credentialViewSchema).parse(await request({ kind: 'list', profileId: profile.id }))
    if (records.some(item => item.profileId !== profile.id)) throw new Error('Данные другого профиля отклонены.')
    setAvailable(state.available); setItems(records)
    if (state.damaged.length) setNotice(`Повреждённые записи не используются: ${state.damaged.length}. Исходные файлы сохранены.`)
  }
  useEffect(() => {
    let alive = true
    void Promise.all([request({ kind: 'status' }), request({ kind: 'list', profileId: profile.id })]).then(([state, records]) => {
      if (!alive) return
      const parsed = statusSchema.parse(state), rows = z.array(credentialViewSchema).parse(records)
      if (rows.some(item => item.profileId !== profile.id)) throw new Error('Данные другого профиля отклонены.')
      setAvailable(parsed.available); setItems(rows)
      if (parsed.damaged.length) setNotice(`Повреждённые записи не используются: ${parsed.damaged.length}. Исходные файлы сохранены.`)
    }).catch(() => { if (alive) setError('Не удалось открыть защищённое хранилище. Перезапустите приложение.') }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [profile.id])
  const act = (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    void work().then(refresh).catch(error => setError(error instanceof Error ? error.message : 'Операция не выполнена.')).finally(() => setBusy(false))
  }
  return <Modal wide title="Защищённые подключения" close={() => { if (!busy) close() }} className="credentials-dialog">
    <p className="muted">Профиль: <strong>{profile.name}</strong>. Секреты шифруются Windows и хранятся отдельно от проектов. В граф переносится только credential ID.</p>
    <p className="muted">Сохранённый секрет выбирается в разделе «Интеграции» для Telegram или HTTP API. Локальная Ollama настраивается в «ИИ-помощнике» и не требует API-ключа.</p>
    {loading ? <p role="status">Открываем защищённое хранилище…</p> : !available && <p role="status" className="field-error">Защищённое хранилище недоступно. Сохранение без шифрования запрещено.</p>}
    {error && <p role="alert" className="field-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <section aria-label="Подключения профиля" className="credential-list">
      <h3>Подключения профиля · {items.length}</h3>
      {!items.length && <p className="muted">Пока нет сохранённых подключений.</p>}
      {items.map(item => <article className="credential-card" key={item.id} aria-label={item.label}>
        <header><div><strong>{item.label}</strong><p className="muted">{item.service}</p></div><span className={item.enabled && item.available ? 'credential-enabled' : 'muted'}>{!item.available ? 'Недоступно' : item.enabled ? 'Использование разрешено' : 'Доступ закрыт'}</span></header>
        <p className="credential-reference">Credential ID: <code>{item.id}</code></p>
        <div className="inline-actions"><button disabled={busy} onClick={() => act(async () => { await request({ kind: 'copy-reference', profileId: profile.id, id: item.id }); setNotice('Credential ID скопирован. Значение секрета не копируется.') })}>Скопировать ID</button>
          <button disabled={busy || (!item.enabled && !item.available)} onClick={() => act(async () => { await request({ kind: 'set-enabled', profileId: profile.id, id: item.id, enabled: !item.enabled }); setNotice(item.enabled ? 'Разрешение отозвано. Следующее обращение к секрету будет отклонено.' : 'Использование разрешено для этого профиля.') })}>{item.enabled ? 'Отозвать доступ' : 'Разрешить использование'}</button>
          <button disabled={busy} onClick={() => setDeleting(item.id)}>Удалить</button></div>
        {deleting === item.id && <div className="credential-delete"><p>Удалить локальную запись? Сам ключ у внешнего сервиса останется действующим.</p><div className="inline-actions"><button disabled={busy} onClick={() => act(async () => { await request({ kind: 'remove', profileId: profile.id, id: item.id }); setDeleting(null); setNotice('Локальная запись удалена.') })}>Удалить подключение</button><button disabled={busy} onClick={() => setDeleting(null)}>Оставить</button></div></div>}
      </article>)}
    </section>
    <form className="credential-form" onSubmit={event => { event.preventDefault(); act(async () => {
      try { await request({ kind: 'create', id: createId(), profileId: profile.id, label, service, secret, enabled }); setLabel(''); setService(''); setEnabled(false); setNotice('Подключение сохранено. Секрет не возвращается в интерфейс.') }
      finally { setSecret('') }
    }) }}>
      <h3>Новое подключение</h3>
      <fieldset disabled={busy || !available}>
        <div className="credential-field"><label htmlFor="credential-label">Название подключения</label><FieldHelp helpKey="credentials.label" /><input id="credential-label" required maxLength={100} value={label} onChange={event => setLabel(event.target.value)} /></div>
        <div className="credential-field"><label htmlFor="credential-service">Сервис или назначение</label><FieldHelp helpKey="credentials.service" /><input id="credential-service" required maxLength={100} value={service} onChange={event => setService(event.target.value)} /></div>
        <div className="credential-field"><label htmlFor="credential-secret">Ключ или пароль</label><FieldHelp helpKey="credentials.secret" /><input id="credential-secret" type="password" autoComplete="new-password" spellCheck={false} required maxLength={8192} value={secret} onChange={event => setSecret(event.target.value)} /></div>
        <div className="credential-grant"><label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Разрешить использование приложением</label><FieldHelp helpKey="credentials.permission" /></div>
        <button className="primary" type="submit">Сохранить защищённое подключение</button>
      </fieldset>
    </form>
  </Modal>
}
