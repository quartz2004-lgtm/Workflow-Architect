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
