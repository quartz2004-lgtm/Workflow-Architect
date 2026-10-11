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

import { createId } from '../domain/factories'
import { nodeSchema, type WorkflowNode } from '../domain/schema'
import type { ExecutionConfig, Predicate } from '../domain/execution-config'

export const operationOptions: Partial<Record<WorkflowNode['type'], { value: ExecutionConfig['kind']; label: string }[]>> = {
  trigger: [{ value: 'manual', label: 'Ручной запуск' }], data: [{ value: 'map', label: 'Преобразование полей' }],
  logic: [{ value: 'if', label: 'Условие · If' }, { value: 'switch', label: 'Выбор · Switch' }, { value: 'loop', label: 'Ограниченный цикл · Loop' }, { value: 'merge', label: 'Объединение · Merge' }],
  human: [{ value: 'human', label: 'Ожидание человека' }], artifact: [{ value: 'artifact', label: 'Локальный файл' }], subworkflow: [{ value: 'subworkflow', label: 'Вложенный workflow' }],
}
export const defaultPredicate = (): Predicate => ({ source: { kind: 'input', pointer: '/approved' }, operator: 'is-true' })

/** A single editor command applies defaults and ports; existing connections and descriptions survive. */
export function configureOperation(source: WorkflowNode, kind: string): WorkflowNode {
  if (!kind) return nodeSchema.parse({ ...source, operation: undefined })
  if (!operationOptions[source.type]?.some(option => option.value === kind)) throw new Error('Операция несовместима с типом узла.')
  const node = structuredClone(source)
  const output = (index: number, name: string) => {
    const found = node.ports.filter(port => port.kind === 'flow' && port.direction === 'output')[index]
    if (found) return found.id
    const id = createId(); node.ports.push({ id, name, direction: 'output', kind: 'flow' }); return id
  }
  switch (kind) {
    case 'manual': node.operation = { kind }; if (node.type === 'trigger') node.config.triggerType = 'manual'; break
    case 'map': node.operation = { kind, keepInput: true, fields: [] }; if (node.type === 'data') node.config.dataType = 'json'; break
    case 'if': node.operation = { kind, predicate: defaultPredicate(), truePortId: output(0, 'true'), falsePortId: output(1, 'false') }; break
    case 'switch': node.operation = { kind, source: { kind: 'input', pointer: '/route' }, cases: [{ value: 'main', portId: output(0, 'main') }], defaultPortId: output(1, 'default') }; break
    case 'loop': node.operation = { kind, predicate: { source: { kind: 'input', pointer: '/counter' }, operator: 'less', value: 3 }, maxIterations: 10, bodyPortId: output(0, 'body'), exitPortId: output(1, 'exit') }; break
    case 'merge': node.operation = { kind }; break
    case 'human': node.operation = { kind, question: 'Продолжить выполнение?', mode: 'approval', timeoutMs: 60000 }; break
    case 'artifact': node.operation = { kind, filename: 'result.json', format: 'json', source: { kind: 'input', pointer: '' } }; break
    case 'subworkflow': node.operation = { kind }; break
  }
  if (node.type === 'logic') node.config.logicType = kind as 'if' | 'switch' | 'loop' | 'merge'
  return nodeSchema.parse(node)
}
