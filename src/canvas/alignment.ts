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

import type { Graph, Position } from '../domain/schema'

export function alignPosition(graph: Graph, id: string, position: Position, excluded: string[], zoom: number) {
  const moving = graph.nodes.find(n => n.id === id)
  if (!moving) return { position, guides: {} as { x?: number; y?: number } }
  const guides: { x?: number; y?: number } = {}
  const result = { ...position }
  const candidates = graph.nodes.filter(n => n.id !== id && !excluded.includes(n.id))
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height'
    let nearest = 6 / zoom
    for (const node of candidates) for (const anchor of [0, 0.5, 1]) for (const target of [0, 0.5, 1]) {
      const targetCoordinate = node.position[axis] + node.size[size] * target
      const delta = targetCoordinate - (position[axis] + moving.size[size] * anchor)
      if (Math.abs(delta) < nearest) { nearest = Math.abs(delta); result[axis] = position[axis] + delta; guides[axis] = targetCoordinate }
    }
  }
  return { position: result, guides }
}
