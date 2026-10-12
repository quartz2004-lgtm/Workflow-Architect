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
import { createEdge, createId } from '../domain/factories'
import { compileProject, type ExecutionPlan } from './compiler'
import { ExecutionRun } from './executor'
import { createExecutionExample } from './example'
import { parseCheckpoint, type RunCheckpoint } from './checkpoint'
import type { RunEvent } from './run-types'

function plan() {
  const project = createExecutionExample()
  const compiled = compileProject(project, project.nodes[0]!.id)
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
  return compiled.plan
}
const input = { approved: true, text: 'Checkpoint' }
async function interrupted(plan: ExecutionPlan, boundary: (saved: RunCheckpoint) => boolean, answer = false) {
  let checkpoint: RunCheckpoint | undefined, stopped = false
  const events: RunEvent[] = []
  const run = new ExecutionRun(plan, event => {
    events.push(event)
    if (answer && event.kind === 'human-request') run.answer(event.request.id, true)
  }, { save: saved => {
    if (stopped) throw new Error('process stopped')
    if (boundary(saved)) { checkpoint = JSON.parse(JSON.stringify(saved)) as RunCheckpoint; stopped = true; throw new Error('process stopped') }
  } })
  await expect(run.start(input)).rejects.toThrow('process stopped')
  expect(checkpoint).toBeDefined()
  return { checkpoint: checkpoint!, events: events.filter(event => event.sequence <= checkpoint!.sequence) }
}
describe('execution checkpoints', () => {
  it('resumes a completed nested frame without repeating its transform or changing run and activation IDs', async () => {
    const snapshot = plan()
    const { checkpoint, events: before } = await interrupted(snapshot, saved => saved.frames.length === 2 && saved.frames[1]!.queue.length === 0)
    expect(parseCheckpoint(checkpoint, snapshot)).toEqual(checkpoint)
    const after: RunEvent[] = []
    const run = new ExecutionRun(snapshot, event => {
      after.push(event)
      if (event.kind === 'human-request') run.answer(event.request.id, true)
    }, { checkpoint })
    const result = await run.start(input)
    expect(result.status).toBe('succeeded')
    expect(result.runId).toBe(checkpoint.runId)
    expect(JSON.parse(result.artifacts[0]!.content)).toEqual({ result: 'CHECKPOINT' })
    const transformId = snapshot.snapshot.subworkflows[0]!.nodes[0]!.id
    expect([...before, ...after].filter(event => event.kind === 'step-start' && event.activation.nodeId === transformId)).toHaveLength(1)
    expect(after[0]!.sequence).toBe(checkpoint.sequence + 1)
    const starts = [...before, ...after].filter(event => event.kind === 'step-start')
    expect(new Set(starts.map(event => event.kind === 'step-start' && event.activation.id)).size).toBe(starts.length)
    expect(result.steps).toBe(starts.length)
  })
  it('restores a pending Human request with the same ID and deadline, accepting one answer only', async () => {
    const snapshot = plan(), { checkpoint } = await interrupted(snapshot, saved => !!saved.frames.at(-1)?.human)
    const request = checkpoint.frames.at(-1)!.human!.request
    const events: RunEvent[] = []
    const run = new ExecutionRun(snapshot, event => {
      events.push(event)
      if (event.kind === 'status' && event.status === 'waiting') {
        expect(run.answer(request.id, 'invalid').ok).toBe(false)
        expect(run.answer(request.id, true).ok).toBe(true)
        expect(run.answer(request.id, true).ok).toBe(false)
      }
    }, { checkpoint })
    expect((await run.start(input)).status).toBe('succeeded')
    expect(events.filter(event => event.kind === 'human-request')).toHaveLength(0)
    expect(events.filter(event => event.kind === 'human-answer')).toHaveLength(1)
  })
  it('restores a Human wait inside a Subworkflow without restarting the parent or child', async () => {
    const project = createExecutionExample()
    const human = project.nodes.find(node => node.type === 'human')!
    const wrapper = project.nodes.find(node => node.type === 'subworkflow')!
    const artifact = project.nodes.find(node => node.type === 'artifact')!
    const alternate = project.nodes.find(node => node.type === 'data')!
    const nested = project.subworkflows[0]!, transform = nested.nodes[0]!
    project.nodes = project.nodes.filter(node => node.id !== human.id)
    project.edges = project.edges.filter(edge => edge.sourceNode !== human.id && edge.targetNode !== human.id)
    for (const source of [wrapper, alternate]) project.edges.push(createEdge(source.id, artifact.id, source.ports[1]!.id, artifact.ports[0]!.id))
    nested.nodes.push(human)
    nested.edges.push(createEdge(transform.id, human.id, transform.ports[1]!.id, human.ports[0]!.id))
    wrapper.ports[1]!.binding = { nodeId: human.id, portId: human.ports[1]!.id }
    const compiled = compileProject(project, project.nodes[0]!.id)
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
    const { checkpoint, events: before } = await interrupted(compiled.plan, saved => saved.frames.length === 2 && !!saved.frames[1]!.human)
    const request = checkpoint.frames[1]!.human!.request
    const events: RunEvent[] = []
    const run = new ExecutionRun(compiled.plan, event => {
      events.push(event)
      if (event.kind === 'status' && event.status === 'waiting') run.answer(request.id, true)
    }, { checkpoint })
    expect((await run.start(input)).status).toBe('succeeded')
    expect(events.filter(event => event.kind === 'step-start').map(event => event.activation.nodeId)).toEqual([artifact.id])
    const original = before.find(event => event.kind === 'step-start' && event.activation.nodeId === wrapper.id)
    const finish = events.find(event => event.kind === 'step-finish' && event.activation.nodeId === wrapper.id)
    expect(original && 'activation' in original && original.activation).toEqual(finish && 'activation' in finish && finish.activation)
  })
  it('persists accepted Human input before advancing and restores it without asking again', async () => {
    const snapshot = plan(), { checkpoint } = await interrupted(snapshot, saved => !!saved.frames.at(-1)?.human?.answer, true)
    const events: RunEvent[] = []
    const run = new ExecutionRun(snapshot, event => events.push(event), { checkpoint })
    expect((await run.start(input)).status).toBe('succeeded')
    expect(events.some(event => event.kind === 'human-request' || event.kind === 'human-answer')).toBe(false)
  })
  it('keeps cancellation final and does not execute queued work on restoration', async () => {
    const snapshot = plan(), { checkpoint } = await interrupted(snapshot, saved => !!saved.frames.at(-1)?.human)
    checkpoint.cancelled = true
    const events: RunEvent[] = []
    const run = new ExecutionRun(snapshot, event => events.push(event), { checkpoint })
    const result = await run.start(input)
    expect(result.status).toBe('cancelled')
    expect(result.artifacts).toEqual([])
    expect(events.some(event => event.kind === 'step-start')).toBe(false)
    expect(run.answer(checkpoint.frames.at(-1)!.human!.request.id, true).ok).toBe(false)
  })
  it('counts time spent asleep against the original deadline', async () => {
    const snapshot = plan(), { checkpoint } = await interrupted(snapshot, saved => !!saved.frames.at(-1)?.human)
    const now = vi.spyOn(Date, 'now').mockReturnValue(checkpoint.deadline + 1)
    try {
      const result = await new ExecutionRun(snapshot, undefined, { checkpoint }).start(input)
      expect(result.status).toBe('failed')
      expect(result.error?.message).toContain('timeout')
      expect(result.artifacts).toEqual([])
    } finally { now.mockRestore() }
  })
  it('rejects incompatible versions, another plan, corrupt frame references and terminal runs', async () => {
    const snapshot = plan(), { checkpoint } = await interrupted(snapshot, saved => !!saved.frames.at(-1)?.human)
    expect(() => new ExecutionRun(snapshot, undefined, { checkpoint: { ...checkpoint, checkpointVersion: 'future' } })).toThrow()
    expect(() => new ExecutionRun(snapshot, undefined, { checkpoint: { ...checkpoint, planId: createId() } })).toThrow('другому плану')
    expect(() => new ExecutionRun(snapshot, undefined, { checkpoint: { ...checkpoint, status: 'succeeded' } })).toThrow('Завершённый')
    const corrupted = structuredClone(checkpoint)
    corrupted.frames[0]!.queue[0]!.nodeId = createId()
    expect(() => new ExecutionRun(snapshot, undefined, { checkpoint: corrupted })).toThrow('очередь')
  })
  it('fails closed when the durable Human acknowledgement cannot be saved', async () => {
    const snapshot = plan()
    let broken = false
    const run = new ExecutionRun(snapshot, event => {
      if (event.kind === 'human-request') {
        broken = true
        expect(run.answer(event.request.id, true).ok).toBe(false)
      }
    }, { save: () => { if (broken) throw new Error('disk unavailable') } })
    await expect(run.start(input)).rejects.toThrow('disk unavailable')
    expect(run.getStatus()).toBe('cancelled')
  })
})
