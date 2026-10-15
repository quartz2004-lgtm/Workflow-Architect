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

import { createProject, createNode, createEdge } from '../domain/factories'
import { configureOperation } from './configure-operation'

export function createTelegramHumanExample() {
  const project = createProject('Telegram · Подтверждение и файл')
  project.settings.defaultMode = 'engineering'
  project.project.description = 'Сообщение Telegram → подтверждение человеком → JSON-файл. Не требует локальной модели. Подходит для проверки подключения и личного чата.'
  const trigger = configureOperation(createNode('trigger', { x: 80, y: 200 }), 'telegram-message')
  const human = configureOperation(createNode('human', { x: 450, y: 200 }), 'human')
  const artifact = configureOperation(createNode('artifact', { x: 820, y: 200 }), 'artifact')
  trigger.title = 'Сообщение Telegram'; human.title = 'Подтверждение в личном чате'; artifact.title = 'Результат проверки'
  human.operation = { kind: 'human', question: 'Подтвердить выполнение и сохранить результат?', mode: 'approval', timeoutMs: 180000 }
  project.nodes = [trigger, human, artifact]
  project.edges = [createEdge(trigger.id, human.id, trigger.ports[1]!.id, human.ports[0]!.id), createEdge(human.id, artifact.id, human.ports[1]!.id, artifact.ports[0]!.id)]
  return project
}
