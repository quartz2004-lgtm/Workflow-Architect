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

import { createEdge, createId, createNode, createProject } from '../domain/factories'
import type { WorkflowNode } from '../domain/schema'
import { configureOperation } from './configure-operation'

/** A runnable example built from the same public domain configuration as Inspector forms. */
export function createExecutionExample() {
  const project = createProject('Первый локальный запуск')
  project.project.description = 'Run: {"approved":true,"text":"Workflow Architect"}. Меняйте approved для проверки двух ветвей. Подтвердите Human и сохраните result.json.'
  project.settings.defaultMode = 'engineering'
  const node = (type: WorkflowNode['type'], kind: string, title: string, x: number, y: number) => ({ ...configureOperation(createNode(type, { x, y }), kind), title })
  const trigger = node('trigger', 'manual', '1. Ручной вход', 80, 240)
  const condition = node('logic', 'if', '2. Разрешено?', 420, 240)
  const nested = node('subworkflow', 'subworkflow', '3. Обработать текст', 760, 80)
  const alternate = node('data', 'map', '3. Нужна доработка', 760, 420)
  const human = node('human', 'human', '4. Проверить результат', 1100, 240)
  const artifact = node('artifact', 'artifact', '5. Сохранить результат', 1440, 240)
  const transform = node('data', 'map', 'Текст в верхний регистр', 160, 160)
  transform.operation = { kind: 'map', keepInput: false, fields: [{ key: 'result', source: { kind: 'input', pointer: '/text' }, transform: 'uppercase' }] }
  alternate.operation = { kind: 'map', keepInput: false, fields: [{ key: 'result', source: { kind: 'literal', value: 'Нужна доработка' }, transform: 'identity' }] }
  const nestedId = createId()
  if (nested.type === 'subworkflow') nested.config.subworkflowId = nestedId
  nested.ports[0]!.binding = { nodeId: transform.id, portId: transform.ports[0]!.id }
  nested.ports[1]!.binding = { nodeId: transform.id, portId: transform.ports[1]!.id }
  const link = (source: WorkflowNode, target: WorkflowNode, port = source.ports[1]!.id) => createEdge(source.id, target.id, port, target.ports[0]!.id)
  project.nodes = [trigger, condition, nested, alternate, human, artifact]
  project.edges = [link(trigger, condition), link(condition, nested), link(condition, alternate, condition.ports[2]!.id), link(nested, human), link(alternate, human), link(human, artifact)]
  project.subworkflows = [{ id: nestedId, title: 'Обработка текста', description: 'Изолированное преобразование входного текста.', nodes: [transform], edges: [], groups: [], ports: [] }]
  return project
}
