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
import type { Project, WorkflowNode } from '../domain/schema'
import { compileProject } from './compiler'
import { ExecutionRun } from './executor'
import type { RunEvent } from './run-types'

const port = (node: WorkflowNode, direction: 'input' | 'output') => node.ports.find(port => port.direction === direction && port.kind === 'flow')!.id
const link = (a: WorkflowNode, b: WorkflowNode, output = port(a, 'output')) => createEdge(a.id, b.id, output, port(b, 'input'))
function configured(type: 'trigger' | 'data' | 'artifact' | 'human') {
  const node = createNode(type)
  if (type === 'trigger') { node.config = { triggerType: 'manual' }; node.operation = { kind: 'manual' } }
  if (type === 'data') node.operation = { kind: 'map', keepInput: true, fields: [] }
  if (type === 'artifact') node.operation = { kind: 'artifact', filename: 'result.json', format: 'json', source: { kind: 'input', pointer: '' } }
  if (type === 'human') node.operation = { kind: 'human', question: 'Продолжить?', mode: 'approval', timeoutMs: 1000 }
  return node
}
function plan(project: Project, trigger: WorkflowNode) {
  const result = compileProject(project, trigger.id)
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.plan
}
function chain() {
  const project = createProject(), trigger = configured('trigger'), data = configured('data'), artifact = configured('artifact')
  project.nodes = [trigger, data, artifact]; project.edges = [link(trigger, data), link(data, artifact)]
  return { project, trigger, data, artifact }
}

describe('local execution', () => {
  it.each([true, false])('executes only the chosen branch (%s), waits for Human and produces actual content', async approved => {
    const { project, trigger, data, artifact } = chain()
    const condition = createNode('logic'), alternative = configured('data'), human = configured('human')
    const yes = port(condition, 'output'), no = createId()
    condition.ports.push({ id: no, name: 'no', direction: 'output', kind: 'flow' })
    condition.operation = { kind: 'if', truePortId: yes, falsePortId: no, predicate: { source: { kind: 'input', pointer: '/approved' }, operator: 'is-true' } }
    data.operation = { kind: 'map', keepInput: false, fields: [{ key: 'result', source: { kind: 'literal', value: 'accepted' }, transform: 'uppercase' }] }
    alternative.operation = { kind: 'map', keepInput: false, fields: [{ key: 'result', source: { kind: 'literal', value: 'review' }, transform: 'identity' }] }
    project.nodes.push(condition, alternative, human)
    project.edges = [link(trigger, condition), link(condition, data, yes), link(condition, alternative, no), link(data, human), link(alternative, human), link(human, artifact)]
    const events: RunEvent[] = []
    const snapshot = plan(project, trigger)
    data.operation = { kind: 'map', keepInput: false, fields: [] }
    const run = new ExecutionRun(snapshot, event => {
      events.push(event)
      if (event.kind === 'human-request') {
        expect(run.getStatus()).toBe('waiting')
        expect(run.answer(event.request.id, 'yes').ok).toBe(false)
        expect(run.answer(event.request.id, true).ok).toBe(true)
      }
    })
    const result = await run.start({ approved })
    expect(result.status).toBe('succeeded')
    expect(JSON.parse(result.artifacts[0]!.content)).toEqual({ result: approved ? 'ACCEPTED' : 'review' })
    const executed = events.filter(event => event.kind === 'step-start').map(event => event.activation.nodeId)
    expect(executed).toContain(approved ? data.id : alternative.id)
    expect(executed).not.toContain(approved ? alternative.id : data.id)
    expect(events.filter(event => event.kind === 'status').map(event => event.status)).toEqual(['queued', 'running', 'waiting', 'running', 'succeeded'])
    await expect(run.start({})).rejects.toThrow('уже начат')
  })
  it('increments a bounded loop, then fails at the loop node when its budget is exhausted', async () => {
    const { project, trigger, data, artifact } = chain()
    const loop = createNode('logic'), body = port(loop, 'output'), exit = createId()
    loop.ports.push({ id: exit, direction: 'output', kind: 'flow', name: 'exit' })
    loop.operation = { kind: 'loop', bodyPortId: body, exitPortId: exit, maxIterations: 3, predicate: { source: { kind: 'input', pointer: '/counter' }, operator: 'less', value: 3 } }
    data.operation = { kind: 'map', keepInput: true, fields: [{ key: 'counter', source: { kind: 'input', pointer: '/counter' }, transform: 'add', operand: 1 }] }
    project.nodes.push(loop); project.edges = [link(trigger, loop), link(loop, data, body), link(data, loop), link(loop, artifact, exit)]
    const success = await new ExecutionRun(plan(project, trigger)).start({ counter: 0 })
    expect(success.status).toBe('succeeded')
    expect(JSON.parse(success.artifacts[0]!.content)).toEqual({ counter: 3 })
    loop.operation.maxIterations = 2
    const failure = await new ExecutionRun(plan(project, trigger)).start({ counter: 0 })
    expect(failure.status).toBe('failed')
    expect(failure.error?.activation?.nodeId).toBe(loop.id)
    expect(failure.error?.message).toContain('итераций')
    expect(failure.artifacts).toEqual([])
  })
  it('cancels running and waiting execution, rejects late answers and never continues to an artifact', async () => {
    const { project, trigger, artifact } = chain(), human = configured('human')
    project.nodes = [trigger, human, artifact]; project.edges = [link(trigger, human), link(human, artifact)]
    let requestId = ''
    const waiting = new ExecutionRun(plan(project, trigger), event => { if (event.kind === 'human-request') { requestId = event.request.id; waiting.cancel() } })
    expect((await waiting.start({})).status).toBe('cancelled')
    expect(waiting.answer(requestId, true).ok).toBe(false)
    const events: RunEvent[] = []
    const running = new ExecutionRun(plan(project, trigger), event => { events.push(event); if (event.kind === 'step-start') running.cancel() })
    const outcome = await running.start({})
    expect(outcome.status).toBe('cancelled')
    expect(outcome.artifacts).toEqual([])
    expect(events.filter(event => event.kind === 'step-start')).toHaveLength(1)
  })
  it('enforces a Human timeout and rejects answers afterwards', async () => {
    vi.useFakeTimers()
    try {
      const { project, trigger, artifact } = chain(), human = configured('human')
      project.nodes = [trigger, human, artifact]; project.edges = [link(trigger, human), link(human, artifact)]
      let requestId = ''
      const run = new ExecutionRun(plan(project, trigger), event => { if (event.kind === 'human-request') requestId = event.request.id })
      const completion = run.start({})
      await vi.advanceTimersByTimeAsync(2000)
      const outcome = await completion
      expect(outcome.status).toBe('failed')
      expect(outcome.error?.activation?.nodeId).toBe(human.id)
      expect(outcome.error?.message).toContain('timeout')
      expect(run.answer(requestId, true).ok).toBe(false)
    } finally { vi.useRealTimers() }
  })
  it('checks actual input, output and edge contracts with node-level errors', async () => {
    const { project, trigger, data } = chain()
    if (trigger.type !== 'trigger' || data.type !== 'data') throw new Error('Wrong fixture')
    trigger.config.payload = { kind: 'json-schema', schema: { type: 'object', required: ['title'] } }
    let outcome = await new ExecutionRun(plan(project, trigger)).start({})
    expect(outcome.error?.activation?.nodeId).toBe(trigger.id)
    data.config.schema = { kind: 'json-schema', schema: { type: 'object', properties: { title: { type: 'number' } } } }
    outcome = await new ExecutionRun(plan(project, trigger)).start({ title: 'text' })
    expect(outcome.error?.activation?.nodeId).toBe(data.id)
    data.config.schema = undefined
    project.edges[0]!.contract = { kind: 'json-schema', schema: false }
    outcome = await new ExecutionRun(plan(project, trigger)).start({ title: 'text' })
    expect(outcome.error?.activation?.nodeId).toBe(trigger.id)
    expect(outcome.status).toBe('failed')
  })
  it('reads Data through stable input port IDs and fails rather than reading an unavailable result', async () => {
    const { project, trigger, data, artifact } = chain(), consumer = configured('data')
    const source = createId(), target = createId()
    data.ports.push({ id: source, direction: 'output', kind: 'data', name: 'source' })
    consumer.ports.push({ id: target, direction: 'input', kind: 'data', name: 'target' })
    consumer.operation = { kind: 'map', keepInput: false, fields: [{ key: 'copied', source: { kind: 'data', portId: target, pointer: '/title' }, transform: 'uppercase' }] }
    project.nodes.push(consumer)
    project.edges = [link(trigger, data), link(data, consumer), link(consumer, artifact), { ...createEdge(data.id, consumer.id, source, target), type: 'data' }]
    const outcome = await new ExecutionRun(plan(project, trigger)).start({ title: 'hello' })
    expect(outcome.status).toBe('succeeded')
    expect(JSON.parse(outcome.artifacts[0]!.content)).toEqual({ copied: 'HELLO' })
    project.edges[0] = link(trigger, consumer)
    const unavailable = await new ExecutionRun(plan(project, trigger)).start({ title: 'hello' })
    expect(unavailable.status).toBe('failed')
    expect(unavailable.error?.activation?.nodeId).toBe(consumer.id)
    expect(unavailable.error?.message).toContain('ещё не выдал')
  })
  it('isolates repeated Subworkflow calls and exposes their actual bound outputs', async () => {
    const { project, trigger, data, artifact } = chain()
    const first = createNode('subworkflow'), second = createNode('subworkflow'), nestedId = createId()
    data.operation = { kind: 'map', keepInput: true, fields: [{ key: 'counter', source: { kind: 'input', pointer: '/counter' }, transform: 'add', operand: 1 }] }
    for (const wrapper of [first, second]) {
      wrapper.operation = { kind: 'subworkflow' }; wrapper.config = { subworkflowId: nestedId }
      wrapper.ports[0]!.binding = { nodeId: data.id, portId: port(data, 'input') }
      wrapper.ports[1]!.binding = { nodeId: data.id, portId: port(data, 'output') }
    }
    project.nodes = [trigger, first, second, artifact]; project.edges = [link(trigger, first), link(first, second), link(second, artifact)]
    project.subworkflows = [{ id: nestedId, title: 'Increment', description: '', ports: [], nodes: [data], edges: [], groups: [] }]
    const events: RunEvent[] = []
    const run = new ExecutionRun(plan(project, trigger), event => events.push(event))
    const outcome = await run.start({ counter: 0 })
    expect(outcome.status).toBe('succeeded')
    expect(JSON.parse(outcome.artifacts[0]!.content)).toEqual({ counter: 2 })
    const inner = events.filter(event => event.kind === 'step-start' && event.activation.nodeId === data.id)
    expect(inner).toHaveLength(2)
    expect(new Set(inner.map(event => event.kind === 'step-start' && event.activation.callId)).size).toBe(2)
    expect(inner.map(event => event.kind === 'step-start' && event.activation.path)).toEqual([[first.id], [second.id]])
    const repeat = await new ExecutionRun(plan(project, trigger)).start({ counter: 5 })
    expect(JSON.parse(repeat.artifacts[0]!.content)).toEqual({ counter: 7 })
  })
  it('never reuses Data results from a previous call of the same Subworkflow', async () => {
    const { project, trigger, artifact } = chain()
    const first = createNode('subworkflow'), second = createNode('subworkflow'), flip = configured('data')
    const choice = createNode('logic'), seed = configured('data'), consumer = configured('data'), nestedId = createId()
    const no = createId(), dataOut = createId(), dataIn = createId()
    choice.ports.push({ id: no, name: 'no', direction: 'output', kind: 'flow' })
    choice.operation = { kind: 'if', truePortId: port(choice, 'output'), falsePortId: no, predicate: { source: { kind: 'input', pointer: '/seed' }, operator: 'is-true' } }
    seed.ports.push({ id: dataOut, name: 'value', direction: 'output', kind: 'data' })
    consumer.ports.push({ id: dataIn, name: 'value', direction: 'input', kind: 'data' })
    consumer.operation = { kind: 'map', keepInput: true, fields: [{ key: 'copied', source: { kind: 'data', portId: dataIn, pointer: '/seed' }, transform: 'identity' }] }
    flip.operation = { kind: 'map', keepInput: true, fields: [{ key: 'seed', source: { kind: 'literal', value: false }, transform: 'identity' }] }
    for (const wrapper of [first, second]) {
      wrapper.operation = { kind: 'subworkflow' }; wrapper.config = { subworkflowId: nestedId }
      wrapper.ports[0]!.binding = { nodeId: choice.id, portId: port(choice, 'input') }
      wrapper.ports[1]!.binding = { nodeId: consumer.id, portId: port(consumer, 'output') }
    }
    project.nodes = [trigger, first, flip, second, artifact]
    project.edges = [link(trigger, first), link(first, flip), link(flip, second), link(second, artifact)]
    project.subworkflows = [{ id: nestedId, title: 'Isolated', description: '', ports: [], groups: [], nodes: [choice, seed, consumer], edges: [link(choice, seed), link(choice, consumer, no), link(seed, consumer), { ...createEdge(seed.id, consumer.id, dataOut, dataIn), type: 'data' }] }]
    const events: RunEvent[] = []
    const outcome = await new ExecutionRun(plan(project, trigger), event => events.push(event)).start({ seed: true })
    expect(outcome.status).toBe('failed')
    expect(outcome.error?.activation?.path).toEqual([second.id])
    expect(outcome.error?.activation?.nodeId).toBe(consumer.id)
    expect(outcome.error?.message).toContain('ещё не выдал')
    expect(events.filter(event => event.kind === 'step-finish' && event.activation.nodeId === consumer.id)).toHaveLength(1)
  })
  it('validates manual input while waiting and does not let observers mutate execution data', async () => {
    const { project, trigger, artifact } = chain(), human = configured('human')
    human.operation = { kind: 'human', mode: 'input', question: 'Введите число', timeoutMs: 1000 }
    human.config = { response: { kind: 'json-schema', schema: { type: 'integer', minimum: 1 } } }
    project.nodes = [trigger, human, artifact]; project.edges = [link(trigger, human), link(human, artifact)]
    const run = new ExecutionRun(plan(project, trigger), event => {
      if (event.kind === 'human-request') {
        expect(run.answer(event.request.id, 0).ok).toBe(false)
        expect(run.getStatus()).toBe('waiting')
        expect(run.answer(event.request.id, 12).ok).toBe(true)
      }
      if (event.kind === 'step-finish') event.output = 'changed by observer'
    })
    const result = await run.start({})
    expect(result.status).toBe('succeeded')
    expect(JSON.parse(result.artifacts[0]!.content)).toBe(12)
  })
  it('fails boundedly when a mapping expands its input', async () => {
    const { project, trigger, data } = chain()
    data.operation = { kind: 'map', keepInput: false, fields: Array.from({ length: 10 }, (_, i) => ({ key: `copy${i}`, source: { kind: 'input' as const, pointer: '/text' }, transform: 'identity' as const })) }
    const result = await new ExecutionRun(plan(project, trigger)).start({ text: 'x'.repeat(100000) })
    expect(result.status).toBe('failed')
    expect(result.error?.activation?.nodeId).toBe(data.id)
    expect(result.error?.message).toContain('лимит')
    expect(result.artifacts).toEqual([])
  })
})
