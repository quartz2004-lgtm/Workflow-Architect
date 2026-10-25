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

import { useState } from 'react'
import type { WorkflowNode } from '../domain/schema'
import type { ExecutionConfig } from '../domain/execution-config'
import { useEditor } from '../app/context'
import { useProfile } from '../profiles/context'
import { aiRequest } from '../ai/client'
import { connectionStateSchema } from '../ai/protocol'
import { FieldHelp } from '../help/FieldHelp'
import { SelectField, TextField } from './controls'
import { KnowledgeFields } from './KnowledgeFields'

export function AiOperationFields({ node, commit }: { node: WorkflowNode; commit: (operation: ExecutionConfig) => void }) {
  const editor = useEditor(), profile = useProfile()?.profile, op = node.operation
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const applyProfileModel = async () => {
    if (!profile || node.type !== 'agent') return
    setLoading(true); setError('')
    try {
      const result = connectionStateSchema.parse(await aiRequest({ action: 'state', profileId: profile.id }))
      if (!result.connection?.enabled) throw new Error('Сначала подключите модель в «ИИ-помощник → Подключение».')
      const current = editor.getActiveGraph().nodes.find(item => item.id === node.id)
      if (current?.type !== 'agent') throw new Error('Узел больше не доступен.')
      editor.execute({ type: 'configure-node', node: { ...current, config: { ...current.config, model: { ...current.config.model, provider: 'ollama', name: result.connection.configuration.model } } } })
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setLoading(false) }
  }
  return <>
    {op?.kind === 'agent' && <>
      <p className="muted">Настройте Ollama в «ИИ-помощник». Роль, инструкции, контекст и разрешённые Tool находятся ниже. Модель получает только данные этого запуска.</p>
      <button disabled={loading || !window.workflowDesktop?.runtime} onClick={() => void applyProfileModel()}>Использовать модель профиля</button>{error && <p className="field-error">{error}</p>}
      <TextField label="Минимум слов в тексте" helpKey="ai.completion" type="number" value={String(op.minimumWords)} commit={value => commit({ ...op, minimumWords: Number(value) })} />
      {op.editorial ? <p className="muted">Редакционная цепочка: замысел → текст → проверка. До трёх версий, затем ваше решение. Инструменты в этой цепочке не вызываются.</p> : <label className="check-field"><input type="checkbox" checked={op.requireTools} onChange={event => commit({ ...op, requireTools: event.target.checked })} />Обязателен каждый разрешённый Tool <FieldHelp helpKey="ai.completion" /></label>}
      <details><summary>Лимиты модели и времени</summary>
      {([{ key: 'maxCalls', label: 'Максимум запросов модели' }, { key: 'maxToolCalls', label: 'Максимум вызовов Tool' }, { key: 'maxOutputTokens', label: 'Токенов на один ответ' }, { key: 'maxTotalTokens', label: 'Общий бюджет токенов Agent' }, { key: 'contextTokens', label: 'Окно контекста, токенов' }] as const).filter(field => !op.editorial || field.key === 'maxOutputTokens' || field.key === 'contextTokens').map(field => <TextField key={field.key} label={field.label} helpKey="ai.limits" type="number" value={String(op.limits[field.key])} commit={value => commit({ ...op, limits: { ...op.limits, [field.key]: Number(value) } })} />)}
      <TextField label="Timeout агента, секунд" helpKey="ai.limits" type="number" value={String(op.limits.timeoutMs / 1000)} commit={value => commit({ ...op, limits: { ...op.limits, timeoutMs: Number(value) * 1000 } })} />
      {!op.editorial && <TextField label="Лимит стоимости API, USD" helpKey="ai.limits" type="number" value={String(op.limits.maxCostUsd)} commit={value => commit({ ...op, limits: { ...op.limits, maxCostUsd: Number(value) } })} />}
      {op.editorial && <>
        <TextField label="Максимум версий текста (1–3)" type="number" value={String(op.editorial.maxRevisions)} commit={value => commit({ ...op, editorial: { ...op.editorial!, maxRevisions: Number(value) } })} />
        <TextField label="Время всей редакции, минут" type="number" value={String(op.editorial.timeoutMs / 60000)} commit={value => commit({ ...op, editorial: { ...op.editorial!, timeoutMs: Number(value) * 60000 } })} />
        <TextField label="Общий бюджет токенов редакции" type="number" value={String(op.editorial.maxTotalTokens)} commit={value => commit({ ...op, editorial: { ...op.editorial!, maxTotalTokens: Number(value) } })} />
      </>}
      <p className="muted">Ollama: $0 API. {op.editorial ? 'Время редакции и ожидания Human учитывается отдельно; весь запуск ограничен двумя часами.' : 'Общий Run: до 5 минут.'} Общий предел: 32 запроса модели и 131 072 токена.</p>
      </details>
      <KnowledgeFields key={`${node.id}:${profile?.id}`} value={op.knowledge} commit={knowledge => commit({ ...op, knowledge })} />
    </>}
    {op?.kind === 'text-statistics' && <><p className="muted">Встроенный Tool: слова, символы, абзацы и Markdown-заголовки. Вход Flow — строка. Agent может передать свой текст или проверить исходный вход. Факты и внешние источники не проверяются.</p><TextField label="Минимум слов для проверки" helpKey="ai.completion" type="number" value={String(op.minimumWords)} commit={value => commit({ ...op, minimumWords: Number(value) })} /></>}
    {op?.kind === 'parallel' && <>
      <SelectField label="Общий Merge" helpKey="ai.parallel" value={op.joinNodeId} options={editor.getActiveGraph().nodes.filter(item => item.id !== node.id && item.operation?.kind === 'merge').map(item => ({ value: item.id, label: item.title }))} commit={joinNodeId => { if (joinNodeId) commit({ ...op, joinNodeId }) }} />
      <TextField label="Одновременно агентов (1–4)" helpKey="ai.parallel" type="number" value={String(op.concurrency)} commit={value => commit({ ...op, concurrency: Number(value) })} />
      <p className="muted">Соедините Parallel → 2–8 Agent → выбранный Merge. Каждая ветвь содержит одного Agent; между ветвями нет зависимостей. Merge выдаст один объект results.</p>
    </>}
  </>
}
