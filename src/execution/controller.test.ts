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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { createRunController, type RunWorker } from './controller'
import { compileProject } from './compiler'
import { ExecutionRun } from './executor'
import { parseWorkerCommand, parseWorkerResponse, type WorkerCommand, type WorkerResponse } from './protocol'

class TestWorker implements RunWorker {
  onmessage: RunWorker['onmessage'] = null
  onerror: RunWorker['onerror'] = null
  onmessageerror: RunWorker['onmessageerror'] = null
  messages: WorkerCommand[] = []
  terminated = false
  postMessage(message: WorkerCommand) { this.messages.push(message) }
  terminate() { this.terminated = true }
  receive(message: unknown) { this.onmessage?.({ data: message } as MessageEvent<unknown>) }
}
function fixture() {
  const project = createProject(), trigger = createNode('trigger'), human = createNode('human'), artifact = createNode('artifact')
  trigger.operation = { kind: 'manual' }; trigger.config = { triggerType: 'manual' }
  human.operation = { kind: 'human', mode: 'approval', question: 'Продолжить?', timeoutMs: 2000 }
  artifact.operation = { kind: 'artifact', filename: 'result.json', format: 'json', source: { kind: 'input', pointer: '' } }
  project.nodes = [trigger, human, artifact]
  project.edges = [createEdge(trigger.id, human.id, trigger.ports[1]!.id, human.ports[0]!.id), createEdge(human.id, artifact.id, human.ports[1]!.id, artifact.ports[0]!.id)]
  return { project, trigger }
}
afterEach(() => vi.useRealTimers())
describe('Worker transport and run state', () => {
  it('routes validated real executor events, Human answers and results without changing the project', async () => {
    const worker = new TestWorker(), controller = createRunController(() => worker), { project, trigger } = fixture()
    controller.start(project, trigger.id, { text: 'before' })
    const command = parseWorkerCommand(worker.messages[0])
    if (command.kind !== 'start') throw new Error('Expected start')
    const compiled = compileProject(command.project, command.entryNodeId)
    if (!compiled.ok) throw new Error('Expected executable plan')
    const send = (message: WorkerResponse) => worker.receive(message)
    const run = new ExecutionRun(compiled.plan, event => send({ kind: 'event', jobId: command.jobId, event }))
    send({ kind: 'ready', jobId: command.jobId, runId: run.id, planId: compiled.plan.id, diagnostics: compiled.diagnostics })
    const completion = run.start(command.input)
    await vi.waitFor(() => expect(controller.store.getState().status).toBe('waiting'))
    project.project.name = 'edited'
    expect(controller.store.getState().snapshot?.project.name).not.toBe('edited')
    const request = controller.store.getState().human!
    controller.answer(request.id, 'invalid')
    const answer = parseWorkerCommand(worker.messages.at(-1))
    if (answer.kind !== 'answer') throw new Error('Expected answer')
    send({ kind: 'answer-result', jobId: command.jobId, requestId: answer.requestId, ...run.answer(answer.requestId, answer.value) })
    expect(controller.store.getState().answerError).not.toBe('')
    controller.answer(request.id, true)
    run.answer(request.id, true)
    const outcome = await completion
    send({ kind: 'complete', jobId: command.jobId, outcome })
    expect(controller.store.getState().status).toBe('succeeded')
    expect(JSON.parse(controller.store.getState().artifacts[0]!.content)).toEqual({ text: 'before' })
    expect(controller.store.getState().human).toBeNull()
    expect(worker.terminated).toBe(true)
    expect(project.nodes.every(node => node.status === 'draft')).toBe(true)
    controller.dispose()
  })
  it('terminates cancellation immediately and ignores delayed messages from a previous worker', () => {
    const workers: TestWorker[] = [], controller = createRunController(() => { const worker = new TestWorker(); workers.push(worker); return worker })
    const { project, trigger } = fixture()
    controller.start(project, trigger.id, {})
    expect(() => controller.start(project, trigger.id, {})).toThrow('текущий')
    const old = workers[0]!, jobId = controller.store.getState().jobId!
    controller.cancel()
    expect(old.terminated).toBe(true)
    expect(controller.store.getState().status).toBe('cancelled')
    controller.start(project, trigger.id, {})
    old.receive({ kind: 'fault', jobId, message: 'stale' })
    workers[1]!.receive({ kind: 'fault', jobId, message: 'other run' })
    expect(controller.store.getState().status).toBe('queued')
    expect(controller.store.getState().events).toEqual([])
    controller.dispose()
  })
  it('fails safely on invalid messages, out-of-order events and worker crashes', () => {
    for (const kind of ['invalid', 'sequence', 'crash', 'decode'] as const) {
      const worker = new TestWorker(), controller = createRunController(() => worker), { project, trigger } = fixture()
      controller.start(project, trigger.id, {})
      const jobId = controller.store.getState().jobId!, runId = createId()
      if (kind === 'invalid') worker.receive({ kind: 'unknown', jobId })
      if (kind === 'sequence') {
        worker.receive({ kind: 'ready', jobId, runId, planId: createId(), diagnostics: [] })
        worker.receive({ kind: 'event', jobId, event: { kind: 'status', status: 'running', runId, sequence: 2, timestamp: new Date().toISOString() } })
      }
      if (kind === 'crash') worker.onerror?.({ message: 'crashed' } as ErrorEvent)
      if (kind === 'decode') worker.onmessageerror?.({} as MessageEvent)
      expect(controller.store.getState().status).toBe('failed')
      expect(worker.terminated).toBe(true)
      controller.dispose()
    }
  })
  it('bounds input before creating a worker and terminates an unresponsive worker', () => {
    vi.useFakeTimers()
    const worker = new TestWorker(), factory = vi.fn(() => worker), controller = createRunController(factory), { project, trigger } = fixture()
    controller.start(project, trigger.id, 'x'.repeat(400000))
    expect(factory).not.toHaveBeenCalled()
    expect(controller.store.getState().status).toBe('failed')
    controller.start(project, trigger.id, {})
    vi.advanceTimersByTime(310000)
    expect(worker.terminated).toBe(true)
    expect(controller.store.getState().status).toBe('failed')
    expect(controller.store.getState().message).toContain('5 минут')
    controller.dispose()
  })
  it('rejects unknown protocol fields, non-JSON values and forged outcome data', () => {
    const jobId = createId()
    expect(() => parseWorkerCommand({ kind: 'cancel', jobId, execute: 'shell' })).toThrow()
    expect(() => parseWorkerCommand({ kind: 'answer', jobId, requestId: createId(), value: () => 1 })).toThrow()
    expect(() => parseWorkerResponse({ kind: 'complete', jobId, outcome: { runId: createId(), status: 'succeeded', steps: -1 } })).toThrow()
  })
})
