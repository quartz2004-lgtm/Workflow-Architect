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
import { defaultAgentLimits } from '../domain/agent-config'
import type { WorkflowNode } from '../domain/schema'
import type { ModelProvider, ModelRequest, ModelResponse } from '../ai/types'
import { compileProject } from './compiler'
import { ExecutionRun } from './executor'
import { parseCheckpoint, type RunCheckpoint } from './checkpoint'
import { runEventSchema } from './protocol'
import type { RunEvent } from './run-types'
import { createArticleExample } from './article-example'
import { defaultAgentKnowledge } from '../domain/knowledge-config'

const link = (a: WorkflowNode, b: WorkflowNode) => createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id)
const reply = (content: string): ModelResponse => ({ content, toolCalls: [], inputTokens: 50, outputTokens: 40, finish: 'stop' })
function fixture(parallel = false) {
  const project = createProject('AI test'), trigger = createNode('trigger'), author = createNode('agent'), editor = createNode('agent'), artifact = createNode('artifact')
  trigger.config = { triggerType: 'manual' }; trigger.operation = { kind: 'manual' }
  for (const [node, role] of [[author, 'Author'], [editor, 'Editor']] as const) {
    node.title = role; node.config = { role, systemPrompt: role, model: { provider: 'ollama', name: 'qwen3:8b' } }
    node.operation = { kind: 'agent', limits: defaultAgentLimits, minimumWords: 0, requireTools: false }
  }
  artifact.operation = { kind: 'artifact', filename: 'article.md', format: 'text', source: { kind: 'input', pointer: '' } }
  project.nodes.push(trigger, author, editor, artifact)
  const fork = createNode('logic'), join = createNode('logic')
  fork.config = { logicType: 'parallel' }; fork.operation = { kind: 'parallel', joinNodeId: join.id, concurrency: 2 }
  join.config = { logicType: 'merge' }; join.operation = { kind: 'merge' }
  if (parallel) { project.nodes.push(fork, join); project.edges.push(link(trigger, fork), link(fork, author), link(fork, editor), link(author, join), link(editor, join), link(join, artifact)) }
  else project.edges.push(link(trigger, author), link(author, editor), link(editor, artifact))
  const plan = () => { const result = compileProject(project, trigger.id); if (!result.ok) throw new Error(JSON.stringify(result.diagnostics)); return result.plan }
  return { project, trigger, author, editor, artifact, fork, join, plan }
}
const provider = (chat: ModelProvider['chat']): ModelProvider => ({ id: 'fake', costPerMillionInput: 0, costPerMillionOutput: 0, async list() { return ['qwen3:8b'] }, async inspect() { return { tools: true, thinking: false, contextTokens: 32768 } }, chat })

describe('AI graph execution', () => {
  it('does not silently generate without explicitly selected knowledge when a context runtime is absent', async () => {
    const f = fixture(), chat = vi.fn(async () => reply('unused'))
    if (f.author.operation?.kind !== 'agent') throw new Error('Expected agent')
    f.author.operation.knowledge = { ...defaultAgentKnowledge, collections: [{ collectionId: createId() }] }
    const result = await new ExecutionRun(f.plan(), () => {}, { provider: () => provider(chat) }).start('Задание')
    expect(result.status).toBe('failed')
    expect(result.error?.message).toContain('пакетом контекста')
    expect(chat).not.toHaveBeenCalled()
  })
  it('ships an executable article example with fresh IDs and explicit Tool grants', () => {
    const project = createArticleExample(), another = createArticleExample()
    expect(compileProject(project, project.nodes[0]!.id).ok).toBe(true)
    expect(new Set([...project.nodes, ...another.nodes].map(node => node.id)).size).toBe(project.nodes.length * 2)
    expect(project.nodes.filter(node => node.type === 'agent').every(node => node.operation?.kind === 'agent' && node.operation.minimumWords === 600)).toBe(true)
  })
  it('checks fork output contracts before issuing any parallel model request', async () => {
    const f = fixture(true), chat = vi.fn(async () => reply('unused'))
    f.fork.ports[1]!.contract = { kind: 'json-schema', schema: { type: 'number' } }
    const result = await new ExecutionRun(f.plan(), () => {}, { provider: () => provider(chat) }).start('wrong type')
    expect(result.status).toBe('failed'); expect(chat).not.toHaveBeenCalled()
  })
  it('runs author then editor with a granted tool and durable trace, producing an actual artifact', async () => {
    const f = fixture(), tool = createNode('tool')
    tool.config = { provider: 'builtin', reference: 'text-statistics' }; tool.operation = { kind: 'text-statistics', minimumWords: 3 }
    const out = createId(), into = createId()
    f.editor.ports.push({ id: out, name: 'tools', direction: 'output', kind: 'tool-access' })
    tool.ports.push({ id: into, name: 'access', direction: 'input', kind: 'tool-access' })
    if (f.editor.type === 'agent' && f.editor.operation?.kind === 'agent') { f.editor.config.toolIds = [tool.id]; f.editor.operation.requireTools = true }
    f.project.nodes.push(tool); f.project.edges.push({ ...createEdge(f.editor.id, tool.id, out, into), type: 'tool-access' })
    const model = provider(vi.fn(async (request: ModelRequest) => {
      if (request.messages[0]!.content.startsWith('Author')) return reply('Три простых слова')
      if (request.messages.at(-1)!.role !== 'tool') return { ...reply(''), toolCalls: [{ name: 'text_statistics_1', arguments: {} }] }
      expect(JSON.parse(request.messages.at(-1)!.content)).toMatchObject({ words: 3, meetsMinimum: true })
      return reply('Проверенная статья')
    }))
    const events: RunEvent[] = [], checkpoints: RunCheckpoint[] = [], plan = f.plan()
    const run = new ExecutionRun(plan, event => { runEventSchema.parse(event); events.push(event) }, { provider: () => model, save: value => { parseCheckpoint(value, plan); checkpoints.push(value) } })
    const result = await run.start('Напиши статью')
    expect(result.status).toBe('succeeded'); expect(result.artifacts[0]?.content).toBe('Проверенная статья')
    expect(events.filter(event => event.kind === 'ai' && event.trace.kind === 'tool-finish')).toHaveLength(1)
    expect(checkpoints.at(-1)?.aiUsage).toMatchObject({ inputTokens: 150, outputTokens: 120, calls: 3, toolCalls: 1 })
    const active = checkpoints.find(checkpoint => checkpoint.frames[0]?.activation?.nodeId === f.editor.id)!
    expect(() => new ExecutionRun(plan, () => {}, { checkpoint: active, provider: () => model })).toThrow('не повторяется')
  })
  it('runs bounded parallel agents and joins once in graph order despite out-of-order completion', async () => {
    const f = fixture(true); let active = 0, peak = 0
    const model = provider(async request => {
      active++; peak = Math.max(peak, active)
      const author = request.messages[0]!.content.startsWith('Author')
      await new Promise(resolve => setTimeout(resolve, author ? 40 : 5)); active--
      return reply(author ? 'A' : 'B')
    })
    const events: RunEvent[] = []
    const result = await new ExecutionRun(f.plan(), event => events.push(event), { provider: () => model }).start('input')
    expect(result.status).toBe('succeeded'); expect(peak).toBe(2)
    expect(JSON.parse(result.artifacts[0]!.content).results).toEqual([{ nodeId: f.author.id, title: 'Author', output: 'A' }, { nodeId: f.editor.id, title: 'Editor', output: 'B' }])
    expect(events.filter(event => event.kind === 'step-start' && event.activation.nodeId === f.join.id)).toHaveLength(1)
    if (f.fork.operation?.kind === 'parallel') f.fork.operation.concurrency = 1
    peak = 0
    expect((await new ExecutionRun(f.plan(), () => {}, { provider: () => model }).start('input')).status).toBe('succeeded')
    expect(peak).toBe(1)
  })
  it('aborts sibling requests on failure and never activates join/artifact', async () => {
    const f = fixture(true); const aborted = vi.fn(), events: RunEvent[] = []
    const model = provider(async (request, signal) => {
      if (request.messages[0]!.content.startsWith('Author')) { await new Promise(resolve => setTimeout(resolve, 10)); throw new Error('model failed') }
      signal.addEventListener('abort', aborted, { once: true })
      return new Promise(() => {})
    })
    const result = await new ExecutionRun(f.plan(), event => events.push(event), { provider: () => model }).start('input')
    expect(result.status).toBe('failed'); expect(result.error?.message).toBe('model failed'); expect(aborted).toHaveBeenCalledOnce()
    expect(events.some(event => event.kind === 'step-start' && [f.join.id, f.artifact.id].includes(event.activation.nodeId))).toBe(false)
  })
  it('keeps the browser/manual path explicit and rejects unsupported grants and ambiguous joins', async () => {
    const f = fixture()
    expect((await new ExecutionRun(f.plan()).start('input')).error?.message).toContain('Windows')
    if (f.author.type === 'agent') f.author.config.toolIds = [createId()]
    expect(compileProject(f.project, f.trigger.id).ok).toBe(false)
    const p = fixture(true); p.project.edges.push(link(p.trigger, p.join))
    expect(compileProject(p.project, p.trigger.id).diagnostics.some(issue => issue.code === 'ai-configuration')).toBe(true)
  })
})
