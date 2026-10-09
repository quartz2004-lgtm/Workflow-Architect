import { describe, expect, it } from 'vitest'
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { deserializeProject, serializeProject } from '../domain/serialization'
import { recoverProject } from './recovery'

describe('partial recovery', () => {
  it('preserves good fields, IDs, ports and connections while isolating a broken agent config in a new project', () => {
    const p = createProject(), agent = createNode('agent'), good = createNode('concept')
    const raw = JSON.stringify({ ...p, nodes: [{ ...agent, config: { role: 'Research', systemPrompt: 'Find sources.', execution: { retries: 'broken' } } }, good], edges: [createEdge(agent.id, good.id, agent.ports[1]!.id, good.ports[0]!.id)] })
    expect(() => deserializeProject(raw)).toThrow()
    const report = recoverProject(raw)
    expect(report.project).not.toBeNull()
    expect(report.project!.project.id).not.toBe(p.project.id)
    expect(report.project!.nodes[0]!.id).toBe(agent.id)
    expect(report.project!.nodes[0]!.config).toMatchObject({ role: 'Research', systemPrompt: 'Find sources.' })
    expect(report.project!.nodes[0]!.ports).toEqual(agent.ports)
    expect(report.project!.nodes[1]).toEqual(good)
    expect(report.project!.edges[0]!.sourceNode).toBe(agent.id)
    expect(report.issues.some(issue => issue.entityId === agent.id && issue.original)).toBe(true)
    expect(report.raw).toBe(raw)
    expect(() => deserializeProject(serializeProject(report.project!))).not.toThrow()
  })
  it('keeps valid nested graphs and resources, resets unsafe fields and retains their original only in the report', () => {
    const p = createProject(), agent = createNode('agent'), nestedId = createId()
    const raw = JSON.stringify({ ...p, schemas: [{ id: createId(), name: 'Valid schema', definition: true }], subworkflows: [{ id: nestedId, title: 'Nested', description: '', ports: [], groups: [], edges: [], nodes: [{ ...agent, config: { role: 'Research', systemPrompt: `sk-${'x'.repeat(24)}` } }] }] })
    const report = recoverProject(raw)
    expect(report.project!.subworkflows[0]!.id).toBe(nestedId)
    expect(report.project!.subworkflows[0]!.nodes[0]!.config).toMatchObject({ role: 'Research' })
    expect(serializeProject(report.project!)).not.toContain('sk-')
    expect(report.raw).toContain('sk-')
    expect(report.project!.schemas).toHaveLength(1)
    expect(report.issues.some(issue => issue.message.includes('Неизвестное'))).toBe(false)
  })
  it('does not guess unknown versions or broken JSON; reports discarded entities and duplicate nodes', () => {
    expect(recoverProject('{broken').project).toBeNull()
    expect(recoverProject('{"schemaVersion":"4.0"}').project).toBeNull()
    const p = createProject(), node = createNode()
    const report = recoverProject(JSON.stringify({ ...p, nodes: [node, node], edges: [{ nonsense: true }] }))
    expect(report.project!.nodes).toHaveLength(1)
    expect(report.project!.edges).toHaveLength(0)
    expect(report.issues.map(issue => issue.message).join()).toContain('Повторяющийся')
    expect(report.issues.some(issue => issue.original)).toBe(true)
  })
})
