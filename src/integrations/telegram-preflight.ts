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

import { z } from 'zod'
import { compileProject } from '../execution/compiler'
import { readPointer, mapValue } from '../execution/values'
import type { JsonValue, ValueSource } from '../domain/execution-config'

export const telegramPreflightSchema = z.strictObject({
  ok: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
})
export type TelegramPreflight = z.infer<typeof telegramPreflightSchema>
export const telegramInputExample = { text: 'Проверка подключения', source: 'telegram', chatId: '123456', userId: '123456' }

/** Structural preflight only. Never runs agents, connectors, or Human requests. */
export function checkTelegramWorkflow(project: unknown, entryNodeId: string): TelegramPreflight {
  const compiled = compileProject(project, entryNodeId)
  if (!compiled.ok) return { ok: false, errors: compiled.diagnostics.filter(item => item.severity === 'error').map(item => item.message), warnings: [] }
  const graph = compiled.plan.snapshot, errors = new Set<string>(), warnings = new Set<string>()
  const queue: { id: string; input: JsonValue | undefined }[] = [{ id: entryNodeId, input: telegramInputExample }]
  const seen = new Set<string>()
  while (queue.length && seen.size < 1000) {
    const { id, input } = queue.shift()!, key = `${id}:${JSON.stringify(input)}`
    if (seen.has(key)) continue
    seen.add(key)
    const node = graph.nodes.find(item => item.id === id), operation = node?.operation
    if (!node || !operation) continue
    const sources: ValueSource[] = []
    if ('fields' in operation) sources.push(...operation.fields.map(field => field.source))
    if ('source' in operation) sources.push(operation.source)
    if ('predicate' in operation && operation.predicate.operator !== 'exists') sources.push(operation.predicate.source)
    for (const source of sources) {
      if (source.kind === 'literal') continue
      if (source.kind === 'data' || input === undefined) {
        warnings.add(`«${node.title}»: поля результата предыдущего инструмента или агента проверяются при выполнении.`)
      } else if (readPointer(input, source.pointer) === undefined) {
        errors.add(`«${node.title}» ожидает поле ${source.pointer}, которого нет во входном сообщении. Telegram передаёт text, source, chatId и userId. Добавьте преобразование полей перед этим узлом или выберите шаблон Telegram.`)
      }
    }
    let output = input
    if (operation.kind === 'map') {
      if (input !== undefined && operation.fields.every(field => field.source.kind !== 'data')) {
        try { output = mapValue(operation, input) }
        catch { output = undefined; warnings.add(`«${node.title}»: преобразование зависит от текста сообщения. Проверьте его тестовым запуском.`) }
      } else output = undefined
    } else if (['agent', 'connector', 'text-statistics', 'subworkflow', 'parallel', 'merge'].includes(operation.kind) || operation.kind === 'human' && operation.mode === 'input') {
      output = undefined
      if (operation.kind === 'subworkflow') warnings.add(`«${node.title}»: входы вложенного процесса требуют тестового запуска.`)
    }
    for (const edge of graph.edges.filter(item => item.type === 'flow' && item.sourceNode === id)) queue.push({ id: edge.targetNode, input: output })
  }
  if (queue.length) errors.add('Сценарий слишком сложен для проверки входа. Упростите ветвления перед подключением Telegram.')
  return { ok: errors.size === 0, errors: [...errors], warnings: [...warnings] }
}
