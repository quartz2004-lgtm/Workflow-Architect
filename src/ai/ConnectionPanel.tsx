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

import { useEffect, useId, useState } from 'react'
import { z } from 'zod'
import type { Profile } from '../profiles/schema'
import { FieldHelp } from '../help/FieldHelp'
import { aiRequest, useAssistantTask } from './client'
import { connectionStateSchema } from './protocol'
import { localConnectionSchema, type LocalConnection } from './schema'
import { TaskStatus } from './TaskStatus'

export function ConnectionPanel({ profileId, changed }: { profileId: Profile['id']; changed: (model: string) => void }) {
  const [config, setConfig] = useState<LocalConnection>({ provider: 'ollama', port: 11434, model: 'qwen3:8b' })
  const [enabled, setEnabled] = useState(false), [models, setModels] = useState<string[]>([]), [pending, setPending] = useState(true)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  const [testedConfig, setTestedConfig] = useState('')
  const task = useAssistantTask(profileId), portId = useId(), modelId = useId()
  useEffect(() => {
    let active = true
    void aiRequest({ action: 'state', profileId }).then(value => {
      if (!active) return
      const state = connectionStateSchema.parse(value)
      if (state.connection) { setConfig(state.connection.configuration); setEnabled(state.connection.enabled); setSaved(true) }
      setError(state.problem)
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)) }).finally(() => { if (active) setPending(false) })
    return () => { active = false }
  }, [profileId])
  const save = async () => {
    setPending(true); setError(''); setMessage('')
    try { const state = connectionStateSchema.parse(await aiRequest({ action: 'save', profileId, configuration: localConnectionSchema.parse(config), enabled })); setSaved(true); changed(state.connection!.configuration.model); setMessage(enabled ? 'Подключение сохранено. Проверьте модель перед первым запуском.' : 'Подключение отключено; активные запросы остановлены.') }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setPending(false) }
  }
  const list = async () => {
    setPending(true); setError('')
    try { const names = z.array(z.string()).parse(await aiRequest({ action: 'models', profileId, port: config.port })); setModels(names); setMessage(names.length ? `Найдено моделей: ${names.length}` : 'Моделей пока нет. Установите модель через Ollama.') }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setPending(false) }
  }
  const change = (next: LocalConnection) => { setConfig(next); setSaved(false); setMessage('') }
  return <section aria-label="Подключение локальной модели" className="ai-section">
    <div className="ai-intro"><span className="eyebrow">LOCAL AI</span><h3>Модель на вашем компьютере</h3><p>Ollama выполняет запросы локально. API-ключ не нужен. Сохранённые здесь настройки доступны только этому профилю.</p></div>
    <fieldset disabled={pending || task.busy} className="ai-form">
      <label className="field" htmlFor={portId}><span>Порт Ollama <FieldHelp helpKey="ai.connection" /></span><input id={portId} type="number" min="1024" max="65535" value={config.port} onChange={event => change({ ...config, port: event.target.valueAsNumber })} /></label>
      <div className="inline-actions"><code>http://127.0.0.1:{Number.isFinite(config.port) ? config.port : '…'}</code><button type="button" onClick={() => void list()}>Найти модели</button></div>
      <label className="field" htmlFor={modelId}><span>Модель <FieldHelp helpKey="ai.connection" /></span><input id={modelId} list="local-ai-models" value={config.model} onChange={event => change({ ...config, model: event.target.value })} placeholder="qwen3:8b" /><datalist id="local-ai-models">{models.map(name => <option key={name} value={name} />)}</datalist></label>
      <label className="ai-check"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setSaved(false) }} />Разрешить локальную модель для этого профиля <FieldHelp helpKey="ai.permission" /></label>
      <div className="inline-actions"><button className="primary" onClick={() => void save()}>Сохранить подключение</button><button disabled={!saved || !enabled} onClick={() => { setTestedConfig(JSON.stringify(config)); void task.start({ mode: 'test' }) }}>Проверить модель и инструменты</button></div>
    </fieldset>
    {message && <p role="status">{message}</p>}{error && <p className="field-error" role="alert">{error}</p>}
    <TaskStatus controller={task} />
    {task.task?.status === 'succeeded' && saved && enabled && testedConfig === JSON.stringify(config) && <p className="ai-success" role="status">✓ Модель ответила, вызвала тестовый инструмент и вернула проверенный JSON.</p>}
    <details><summary>Как установить модель</summary><p>Установите Ollama с официального сайта, затем в терминале выполните <code>ollama pull qwen3:8b</code>. Дождитесь загрузки и оставьте Ollama запущенной. В этом окне нажмите «Найти модели», сохраните подключение и запустите проверку.</p><p className="muted">Модель занимает несколько гигабайт. Первый запрос может занять больше времени из-за загрузки в память GPU. Облачные модели этим подключением не разрешены.</p></details>
  </section>
}
