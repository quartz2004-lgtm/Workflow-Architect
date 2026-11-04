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
import { useStore } from 'zustand'
import { z } from 'zod'
import { useEditor } from '../app/context'
import { useProfile } from '../profiles/context'
import { aiRequest } from './client'
import { connectionStateSchema } from './protocol'

export function ModelReadiness() {
  const editor = useEditor(), profile = useProfile()?.profile
  const service = useStore(editor.uiStore, state => state.serviceDialog)
  const [message, setMessage] = useState('Читаем настройки модели…'), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    if (!profile || !window.workflowDesktop?.runtime) return
    void aiRequest({ action: 'state', profileId: profile.id }).then(value => {
      const state = connectionStateSchema.parse(value)
      if (active) setMessage(state.problem || (!state.connection ? 'Модель не подключена.' : !state.connection.enabled ? 'Использование модели выключено.' : `${state.connection.configuration.model} · настроена. Доступность ещё не проверена.`))
    }).catch(error => { if (active) setMessage(`Не удалось прочитать настройки: ${error instanceof Error ? error.message : String(error)}`) })
    return () => { active = false }
  }, [profile, service])
  const check = async () => {
    if (!profile) return
    setBusy(true)
    try {
      const state = connectionStateSchema.parse(await aiRequest({ action: 'state', profileId: profile.id }))
      if (state.problem) throw new Error(state.problem)
      if (!state.connection?.enabled) throw new Error('Подключите и разрешите модель в настройках этого профиля.')
      const config = state.connection.configuration
      const models = z.array(z.string()).parse(await aiRequest({ action: 'models', profileId: profile.id, port: config.port }))
      const normalize = (name: string) => name.includes(':') ? name : `${name}:latest`
      if (!models.some(name => normalize(name) === normalize(config.model))) throw new Error(`Ollama доступна, но модель ${config.model} не найдена. Выберите установленную модель в настройках.`)
      setMessage(`${config.model} найдена в Ollama · ${new Date().toLocaleTimeString('ru-RU')}. Это проверка доступности, не генерации или качества текста. Узел может задавать другую модель.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <section className="model-readiness" aria-label="Готовность модели профиля">
    <p><strong>Профиль: {profile?.name ?? 'локальный'}</strong> · {window.workflowDesktop?.runtime ? message : 'Локальный ИИ доступен в Windows-приложении. Браузерный редактор работает без модели.'}</p>
    <div className="inline-actions"><button disabled={busy || !profile || !window.workflowDesktop?.runtime} onClick={() => void check()}>{busy ? 'Проверяем Ollama…' : 'Проверить доступность модели'}</button><button onClick={() => editor.uiStore.setState({ serviceDialog: 'ai' })}>Настройки модели</button></div>
  </section>
}
