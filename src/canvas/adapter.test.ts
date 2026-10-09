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
