import { expect, it } from 'vitest'
import { createEdge, createNode, createProject } from '../domain/factories'
import { serializeProject } from '../domain/serialization'
import { projectToCanvas } from './adapter'

it('projects IDs, ports, dimensions and selection without mutating the durable model', () => {
  const p = createProject()
  const a = createNode(); const b = createNode()
  p.nodes.push(a, b)
  const e = createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id)
  p.edges.push(e)
  const before = serializeProject(p)
  const view = projectToCanvas(p, { nodeIds: [a.id], edgeIds: [e.id] })
  expect(view.nodes[0]).toMatchObject({ id: a.id, selected: true, width: a.size.width })
  expect(view.edges[0]).toMatchObject({ sourceHandle: e.sourcePort, targetHandle: e.targetPort })
  expect(serializeProject(p)).toBe(before)
})
