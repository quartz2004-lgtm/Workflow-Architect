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

import { describe, expect, it, vi } from 'vitest'
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { configureOperation } from './configure-operation'
import { compileProject } from './compiler'
import { ExecutionRun } from './executor'
import type { ModelProvider } from '../ai/types'

describe('connector execution boundary', () => {
  it('maps Flow fields, forwards stable activation keys and fails clearly without a native host', async () => {
    const project = createProject(), start = configureOperation(createNode('trigger'), 'manual'), tool = configureOperation(createNode('tool'), 'connector')
    tool.operation = { kind: 'connector', connectionId: createId(), action: 'files.write', fields: [
      { key: 'path', source: { kind: 'literal', value: 'article.md' }, transform: 'identity' },
      { key: 'content', source: { kind: 'input', pointer: '/text' }, transform: 'identity' },
    ] }
    project.nodes = [start, tool]; project.edges = [createEdge(start.id, tool.id, start.ports[1]!.id, tool.ports[0]!.id)]
    const compiled = compileProject(project, start.id); if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const connector = vi.fn(async () => ({ saved: true })), run = new ExecutionRun(compiled.plan, undefined, { connector })
    expect((await run.start({ text: 'Статья' })).status).toBe('succeeded')
    expect(connector).toHaveBeenCalledExactlyOnceWith(tool.operation.connectionId, expect.stringContaining(run.id), 'files.write', { path: 'article.md', content: 'Статья' }, expect.any(AbortSignal))
    const browser = await new ExecutionRun(compiled.plan).start({ text: 'Статья' })
    expect(browser.status).toBe('failed'); expect(browser.error?.message).toContain('Windows-runtime')
  })
  it('lets an explicitly granted Agent call a connector but cannot override fixed fields', async () => {
    const project = createProject(), start = configureOperation(createNode('trigger'), 'manual'), agent = configureOperation(createNode('agent'), 'agent'), tool = configureOperation(createNode('tool'), 'connector')
    if (agent.type !== 'agent') throw new Error('agent')
    tool.operation = { kind: 'connector', connectionId: createId(), action: 'files.read', fields: [{ key: 'path', source: { kind: 'literal', value: 'article.md' }, transform: 'identity' }] }
    agent.config.toolIds = [tool.id]
    const from = createId(), into = createId(); agent.ports.push({ id: from, kind: 'tool-access', name: 'tool', direction: 'output' }); tool.ports.push({ id: into, kind: 'tool-access', name: 'access', direction: 'input' })
    project.nodes = [start, agent, tool]; project.edges = [createEdge(start.id, agent.id, start.ports[1]!.id, agent.ports[0]!.id), { ...createEdge(agent.id, tool.id, from, into), type: 'tool-access' }]
    const compiled = compileProject(project, start.id); if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    let calls = 0
    const provider: ModelProvider = { id: 'test', costPerMillionInput: 0, costPerMillionOutput: 0, list: async () => ['qwen3:8b'], inspect: async () => ({ tools: true, thinking: false, contextTokens: 32768 }), chat: async request => {
      calls++
      return { content: calls === 1 ? '' : 'Готово', toolCalls: calls === 1 ? [{ name: request.tools[0]!.name, arguments: { path: 'other.md' } }] : [], inputTokens: 10, outputTokens: 10, finish: 'stop' }
    } }
    const connector = vi.fn(async () => ({ content: 'Статья' }))
    const result = await new ExecutionRun(compiled.plan, undefined, { provider: () => provider, connector }).start('Прочитай статью')
    expect({ status: result.status, error: result.error }).toEqual({ status: 'succeeded', error: undefined })
    expect(connector.mock.calls[0]).toEqual([tool.operation.connectionId, expect.stringContaining(':tool:0'), 'files.read', { path: 'article.md' }, expect.any(AbortSignal)])
    agent.config.toolIds = []
    expect(compileProject(project, start.id).ok).toBe(false)
  })
})
