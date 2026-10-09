import { createId, createNode } from '../domain/factories'
import type { Graph, Group, Project, WorkflowNode } from '../domain/schema'

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal' | 'vertical'
export function selectionBounds(nodes: WorkflowNode[]) {
  if (!nodes.length) return { x: 0, y: 0, width: 260, height: 150 }
  const x = Math.min(...nodes.map(n => n.position.x)); const y = Math.min(...nodes.map(n => n.position.y))
  return { x, y, width: Math.max(...nodes.map(n => n.position.x + n.size.width)) - x, height: Math.max(...nodes.map(n => n.position.y + n.size.height)) - y }
}
export function makeGroup(graph: Graph, ids: string[]): Group {
  const nodes = graph.nodes.filter(n => ids.includes(n.id))
  if (!nodes.length) throw new Error('Выберите узлы для группы.')
  const bounds = selectionBounds(nodes)
  return { id: createId(), title: 'Новая группа', description: '', nodeIds: nodes.map(n => n.id), collapsed: false,
    position: { x: bounds.x - 30, y: bounds.y - 60 }, size: { width: bounds.width + 60, height: bounds.height + 90 } }
}
export function alignNodes(graph: Graph, ids: string[], alignment: Alignment): void {
  const nodes = graph.nodes.filter(n => ids.includes(n.id))
  if (nodes.length < 2) return
  const bounds = selectionBounds(nodes)
  if (alignment === 'horizontal' || alignment === 'vertical') {
    const horizontal = alignment === 'horizontal'
    const axis = horizontal ? 'x' : 'y'; const size = horizontal ? 'width' : 'height'
    const sorted = [...nodes].sort((a, b) => a.position[axis] - b.position[axis])
    const gap = (bounds[size] - sorted.reduce((sum, n) => sum + n.size[size], 0)) / (sorted.length - 1)
    let offset = bounds[axis]
    for (const node of sorted) { node.position[axis] = offset; offset += node.size[size] + gap }
    return
  }
  for (const node of nodes) {
    switch (alignment) {
      case 'left': node.position.x = bounds.x; break
      case 'center': node.position.x = bounds.x + (bounds.width - node.size.width) / 2; break
      case 'right': node.position.x = bounds.x + bounds.width - node.size.width; break
      case 'top': node.position.y = bounds.y; break
      case 'middle': node.position.y = bounds.y + (bounds.height - node.size.height) / 2; break
      case 'bottom': node.position.y = bounds.y + bounds.height - node.size.height; break
    }
  }
}

/** Moves members into a graph and replaces every boundary crossing with an exposed port. */
export function convertGroup(project: Project, graph: Graph, groupId: string): void {
  const group = graph.groups.find(g => g.id === groupId)
  if (!group) throw new Error('Группа не найдена.')
  const ids = new Set(group.nodeIds)
  const wrapper = createNode('subworkflow', { ...group.position })
  if (wrapper.type !== 'subworkflow') throw new Error('Некорректный тип узла')
  wrapper.id = group.id
  wrapper.title = group.title; wrapper.description = group.description; wrapper.color = group.color
  const nested: Project['subworkflows'][number] = {
    id: createId(), title: group.title, description: group.description, ports: [],
    nodes: graph.nodes.filter(n => ids.has(n.id)), edges: graph.edges.filter(e => ids.has(e.sourceNode) && ids.has(e.targetNode)), groups: [],
  }
  wrapper.config.subworkflowId = nested.id
  wrapper.ports = []
  graph.edges = graph.edges.filter(e => !(ids.has(e.sourceNode) && ids.has(e.targetNode)))
  for (const edge of graph.edges) {
    for (const direction of ['input', 'output'] as const) {
      const internalId = direction === 'input' ? edge.targetNode : edge.sourceNode
      if (!ids.has(internalId)) continue
      const internalPort = direction === 'input' ? edge.targetPort : edge.sourcePort
      const target = nested.nodes.find(n => n.id === internalId)
      const port = { id: createId(), name: edge.label || target?.title || direction, kind: edge.type, direction, contract: edge.contract,
        binding: { nodeId: internalId, portId: internalPort } }
      wrapper.ports.push(port)
      if (direction === 'input') { edge.targetNode = wrapper.id; edge.targetPort = port.id }
      else { edge.sourceNode = wrapper.id; edge.sourcePort = port.id }
    }
  }
  graph.nodes = graph.nodes.filter(n => !ids.has(n.id))
  graph.nodes.push(wrapper)
  graph.groups = graph.groups.filter(g => g.id !== groupId)
  project.subworkflows.push(nested)
}
