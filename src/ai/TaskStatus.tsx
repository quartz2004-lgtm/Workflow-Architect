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

import type { useAssistantTask } from './client'

export function TaskStatus({ controller }: { controller: ReturnType<typeof useAssistantTask> }) {
  const { task, error, busy } = controller
  const usage = task?.trace.reduce((sum, trace) => trace.kind === 'model-finish' ? sum + trace.inputTokens + trace.outputTokens : sum, 0) ?? 0
  return <div className="ai-task-status" aria-live="polite">
    {busy && <><p role="status">Локальная модель обрабатывает запрос… <button onClick={() => void controller.cancel()}>Остановить</button></p><p className="muted">Закрытие помощника или переход в другой его раздел остановит этот запрос.</p></>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {task?.message && <p className={task.status === 'failed' ? 'field-error' : 'muted'}>{task.message}</p>}
    {!!task?.trace.length && <details><summary>История вызовов · {usage} токенов · $0 API</summary><ol>{task.trace.map((event, index) => <li key={index}>{event.kind === 'model-start' ? `Запрос ${event.call} · ${event.model}` : event.kind === 'model-finish' ? `${event.inputTokens} вход / ${event.outputTokens} выход · ${(event.durationMs / 1000).toFixed(1)} с` : event.kind === 'tool-start' ? `Инструмент: ${event.name}` : `Результат инструмента: ${JSON.stringify(event.result)}`}</li>)}</ol></details>}
  </div>
}
