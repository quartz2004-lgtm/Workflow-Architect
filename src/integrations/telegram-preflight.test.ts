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

import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createId, createNode, createEdge, createProject } from '../domain/factories'
import { createExecutionExample } from '../execution/example'
import { createTelegramArticleExample } from '../execution/article-example'
import { configureOperation } from '../execution/configure-operation'
import { profileIds } from '../profiles/schema'
import { checkTelegramWorkflow } from './telegram-preflight'
import { SourceStore } from './source-store'

function simple() {
  const project = createProject('Telegram Human'), trigger = configureOperation(createNode('trigger'), 'telegram-message'), human = configureOperation(createNode('human'), 'human'), artifact = configureOperation(createNode('artifact'), 'artifact')
  project.nodes = [trigger, human, artifact]
  project.edges = [createEdge(trigger.id, human.id, trigger.ports[1]!.id, human.ports[0]!.id), createEdge(human.id, artifact.id, human.ports[1]!.id, artifact.ports[0]!.id)]
  return { project, trigger }
}
describe('Telegram activation preflight', () => {
  it('rejects the local JSON example before a chat receives its missing approved field error', () => {
    const project = createExecutionExample(), result = checkTelegramWorkflow(project, project.nodes[0]!.id)
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('/approved')
    expect(result.errors.join(' ')).toContain('преобразование')
  })
  it('accepts message, Human and artifact, and reports the dynamic boundary of article agents', () => {
    const { project, trigger } = simple()
    expect(checkTelegramWorkflow(project, trigger.id)).toEqual({ ok: true, errors: [], warnings: [] })
    const article = createTelegramArticleExample()
    expect(checkTelegramWorkflow(article, article.nodes[0]!.id)).toMatchObject({ ok: true })
    expect(checkTelegramWorkflow(article, article.nodes[0]!.id).warnings.length).toBeGreaterThan(0)
  })
  it('checks fields after a declared map instead of assuming every node receives the original message', () => {
    const { project, trigger } = simple(), map = configureOperation(createNode('data'), 'map')
    map.operation = { kind: 'map', keepInput: false, fields: [{ key: 'answer', source: { kind: 'input', pointer: '/text' }, transform: 'identity' }] }
    const artifact = project.nodes[2]!
    artifact.operation = { kind: 'artifact', filename: 'result.txt', format: 'text', source: { kind: 'input', pointer: '/answer' } }
    project.nodes = [trigger, map, artifact]
    project.edges = [createEdge(trigger.id, map.id, trigger.ports[1]!.id, map.ports[0]!.id), createEdge(map.id, artifact.id, map.ports[1]!.id, artifact.ports[0]!.id)]
    expect(checkTelegramWorkflow(project, trigger.id).ok).toBe(true)
    artifact.operation.source = { kind: 'input', pointer: '/text' }
    expect(checkTelegramWorkflow(project, trigger.id).errors.join(' ')).toContain('/text')
  })
  it('publishes and assigns without replacing the old snapshot; invalid, foreign and stale choices preserve the binding', () => {
    const root = mkdtempSync(join(tmpdir(), 'wa-activation-'))
    try {
      const store = new SourceStore(root), { project, trigger } = simple(), profileId = profileIds[0]
      const binding = store.saveBinding({ version: '0.5', id: createId(), profileId, connectionId: createId(), botId: '123', chatId: '456', userId: '456', workflowId: null, lastJobId: null })
      const first = store.activate(profileId, binding.id, null, 'First', project, trigger.id)
      const invalid = createExecutionExample()
      expect(() => store.activate(profileId, binding.id, first.workflow.id, 'Invalid', invalid, invalid.nodes[0]!.id)).toThrow('/approved')
      expect(() => store.activate(profileIds[1], binding.id, first.workflow.id, 'Foreign', project, trigger.id)).toThrow('недоступен')
      expect(() => store.activate(profileId, binding.id, null, 'Stale', project, trigger.id)).toThrow('уже изменён')
      expect(store.binding(profileId, binding.id).workflowId).toBe(first.workflow.id)
      const second = store.activate(profileId, binding.id, first.workflow.id, 'Second', project, trigger.id)
      expect(second.workflow.id).not.toBe(first.workflow.id)
      expect(store.workflow(profileId, first.workflow.id).label).toBe('First')
      const bad = store.publish(profileId, 'Local', invalid, invalid.nodes[0]!.id)
      expect(() => store.selectWorkflow(profileId, binding.id, bad.id)).toThrow('/approved')
      expect(() => store.selectWorkflow(profileId, binding.id, first.workflow.id, first.workflow.id)).toThrow('уже изменён')
      expect(new SourceStore(root).binding(profileId, binding.id).workflowId).toBe(second.workflow.id)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
