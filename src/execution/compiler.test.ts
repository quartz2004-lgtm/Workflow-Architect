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
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import type { WorkflowNode } from '../domain/schema'
import { compileProject } from './compiler'

const connect = (source: WorkflowNode, target: WorkflowNode, sourcePort = source.ports.find(port => port.direction === 'output')!.id) => createEdge(source.id, target.id, sourcePort, target.ports.find(port => port.direction === 'input')!.id)
function fixture() {
  const project = createProject('Executable')
  const trigger = createNode('trigger'), data = createNode('data'), artifact = createNode('artifact')
  trigger.config = { triggerType: 'manual' }; trigger.operation = { kind: 'manual' }
  data.config = { dataType: 'json' }; data.operation = { kind: 'map', keepInput: true, fields: [] }
  artifact.operation = { kind: 'artifact', filename: 'result.json', format: 'json', source: { kind: 'input', pointer: '' } }
  project.nodes.push(trigger, data, artifact)
  project.edges.push(connect(trigger, data), connect(data, artifact))
  return { project, trigger, data, artifact }
}
const codes = (project: unknown, entry: string) => compileProject(project, entry).diagnostics.map(issue => issue.code)

describe('execution compiler', () => {
  it('captures a serializable frozen snapshot independent of draft edits and positions', () => {
    const { project, trigger, data } = fixture()
    data.color = undefined
    const result = compileProject(project, trigger.id)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Fixture must compile')
    expect(result.plan.planVersion).toBe('0.4')
    expect(JSON.parse(JSON.stringify(result.plan))).toEqual(result.plan)
    data.title = 'Changed after Run'; data.position.x = 999
    expect(result.plan.snapshot.nodes[1]?.title).not.toBe(data.title)
    expect(Object.isFrozen(result.plan.snapshot.nodes[1]?.operation)).toBe(true)
    expect(() => { result.plan.snapshot.nodes[0]!.title = 'Mutate' }).toThrow()
    expect(compileProject(project, trigger.id).ok).toBe(true)
  })
  it('separates structurally valid drafts from executable configurations', () => {
    const { project, trigger, data } = fixture()
    project.nodes.push(createNode('concept'), createNode('agent'), createNode('tool'))
    data.operation = undefined
    const result = compileProject(project, trigger.id)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.filter(issue => issue.code === 'unsupported-node')).toHaveLength(1)
    expect(result.diagnostics.filter(issue => issue.code === 'missing-operation')).toHaveLength(3)
    expect(result.diagnostics.find(issue => issue.entityId === data.id)?.code).toBe('missing-operation')
    expect(codes(project, createId())).toContain('entry')
  })
  it('rejects old text conditions, unsupported contracts and disabled endpoints', () => {
    const { project, trigger, data } = fixture()
    project.edges[0]!.condition = 'fetch("https://example.com")'
    data.config = { schema: { kind: 'json-schema', schema: { pattern: '(a+)+$' } } }
    expect(codes(project, trigger.id)).toEqual(expect.arrayContaining(['text-condition', 'unsupported-contract']))
    data.status = 'disabled'
    expect(codes(project, trigger.id)).toContain('disabled-endpoint')
  })
  it('resolves shared contracts and reports informal descriptions without pretending to validate them', () => {
    const { project, trigger, data } = fixture()
    const id = createId()
    project.schemas.push({ id, name: 'Input', definition: { type: 'object' } })
    trigger.config = { triggerType: 'manual', payload: { kind: 'schema-ref', schemaId: id } }
    data.config = { schema: { kind: 'informal', description: 'A report' } }
    const result = compileProject(project, trigger.id)
    expect(result.ok).toBe(true)
    expect(result.diagnostics.find(issue => issue.code === 'informal-contract')?.severity).toBe('warning')
    project.schemas = []
    expect(compileProject(project, trigger.id).ok).toBe(false)
  })
  it('requires explicit branch ports and prevents bypassing a loop guard', () => {
    const { project, trigger, data, artifact } = fixture()
    const loop = createNode('logic')
    const body = loop.ports[1]!, exit = { ...body, id: createId(), name: 'exit' }
    loop.ports.push(exit)
    loop.config = { logicType: 'loop' }
    loop.operation = { kind: 'loop', predicate: { source: { kind: 'input', pointer: '/counter' }, operator: 'less', value: 3 }, maxIterations: 3, bodyPortId: body.id, exitPortId: exit.id }
    project.nodes.push(loop)
    project.edges = [connect(trigger, loop), connect(loop, data, body.id), connect(data, loop), connect(loop, artifact, exit.id)]
    expect(compileProject(project, trigger.id).ok).toBe(true)
    project.edges.push(connect(data, data))
    expect(codes(project, trigger.id)).toContain('unbounded-cycle')
    project.edges.pop()
    loop.operation = { ...loop.operation, exitPortId: body.id }
    expect(codes(project, trigger.id)).toContain('branch-ports')
  })
  it('validates Subworkflow boundary bindings and recursive inclusion', () => {
    const { project, trigger, data, artifact } = fixture()
    const wrapper = createNode('subworkflow'), nestedId = createId()
    wrapper.config = { subworkflowId: nestedId }; wrapper.operation = { kind: 'subworkflow' }
    wrapper.ports[0]!.binding = { nodeId: data.id, portId: data.ports[0]!.id }
    wrapper.ports[1]!.binding = { nodeId: data.id, portId: data.ports[1]!.id }
    project.nodes = [trigger, wrapper, artifact]
    project.edges = [connect(trigger, wrapper), connect(wrapper, artifact)]
    project.subworkflows.push({ id: nestedId, title: 'Child', description: '', nodes: [data], edges: [], groups: [], ports: [] })
    expect(compileProject(project, trigger.id).ok).toBe(true)
    wrapper.ports[0]!.binding = undefined
    expect(codes(project, trigger.id)).toContain('subworkflow-binding')
    const recursive = createNode('subworkflow'); recursive.config = { subworkflowId: nestedId }
    project.subworkflows[0]!.nodes.push(recursive)
    expect(codes(project, trigger.id)).toContain('recursive-subworkflow')
  })
  it('treats Reference as non-executable and Data as typed transport with one writer per port', () => {
    const { project, trigger, data, artifact } = fixture()
    const output = { id: createId(), name: 'value', direction: 'output' as const, kind: 'data' as const }
    const input = { id: createId(), name: 'value', direction: 'input' as const, kind: 'data' as const }
    data.ports.push(output); artifact.ports.push(input)
    const edge = { ...createEdge(data.id, artifact.id, output.id, input.id), type: 'data' as const }
    project.edges.push(edge)
    expect(compileProject(project, trigger.id).ok).toBe(true)
    project.edges.push({ ...edge, id: createId() })
    expect(codes(project, trigger.id)).toContain('data-writers')
    project.edges.pop()
    project.edges.push({ ...createEdge(data.id, artifact.id), type: 'reference' })
    expect(compileProject(project, trigger.id).ok).toBe(true)
  })
})
