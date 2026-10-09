import { describe, expect, it } from 'vitest'
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { serializeProject } from '../domain/serialization'
import { validateProject } from './validate-project'

describe('semantic validation', () => {
  it('permits raw export with diagnostics while detecting broken endpoints and duplicate IDs', () => {
    const p = createProject()
    const node = createNode()
    p.nodes.push(node, structuredClone(node))
    p.edges.push(createEdge(node.id, createId()))
    expect(validateProject(p).map(i => i.code)).toEqual(expect.arrayContaining(['duplicate-id', 'broken-edge', 'unresolved-concept']))
    expect(() => serializeProject(p)).not.toThrow()
  })
  it('detects wrong-direction ports, missing contracts and broken shared-schema refs', () => {
    const p = createProject()
    const a = createNode(); const b = createNode()
    p.nodes.push(a, b)
    const e = createEdge(a.id, b.id, a.ports[0]!.id, b.ports[1]!.id)
    e.type = 'data'
    p.edges.push(e)
    expect(validateProject(p).map(i => i.code)).toEqual(expect.arrayContaining(['invalid-port', 'missing-contract']))
    e.contract = { kind: 'schema-ref', schemaId: createId() }
    expect(validateProject(p).map(i => i.code)).toContain('broken-schema')
  })
  it('validates nested graphs, tool references and recursive containment', () => {
    const p = createProject()
    const id = createId()
    const child = createNode('subworkflow')
    if (child.type !== 'subworkflow') throw new Error('factory')
    child.config.subworkflowId = id
    const agent = createNode('agent')
    if (agent.type !== 'agent') throw new Error('factory')
    agent.config.toolIds = [createId()]
    p.subworkflows.push({ id, title: 'nested', description: '', ports: [], nodes: [child, agent], edges: [], groups: [] })
    expect(validateProject(p).map(i => i.code)).toEqual(expect.arrayContaining(['broken-tool', 'recursive-subworkflow', 'incomplete-agent']))
  })
})
