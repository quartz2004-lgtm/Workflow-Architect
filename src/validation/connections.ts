import type { Graph, Project, WorkflowEdge, WorkflowNode } from '../domain/schema'

export function connectionProblems(graph: Graph, edge: WorkflowEdge, project?: Project): { code: string; message: string }[] {
  const problems: { code: string; message: string }[] = []
  const source = graph.nodes.find(n => n.id === edge.sourceNode)
  const target = graph.nodes.find(n => n.id === edge.targetNode)
  if (!source || !target) problems.push({ code: 'broken-edge', message: 'Конец связи не найден в этом графе.' })
  if (source?.type === 'note' || target?.type === 'note') problems.push({ code: 'note-connection', message: 'Заметки не участвуют в графе связей.' })
  for (const [node, portId, direction] of [[source, edge.sourcePort, 'output'], [target, edge.targetPort, 'input']] as const) {
    if (!node || !portId) continue
    const port = node.ports.find(p => p.id === portId)
    if (!port || port.direction !== direction || port.kind !== edge.type) problems.push({ code: 'invalid-port', message: 'Порт отсутствует или несовместим с типом/направлением связи.' })
  }
  const endpointType = (node: WorkflowNode | undefined, portId: string | undefined, visited = new Set<string>()): string | undefined => {
    if (node?.type !== 'subworkflow' || !project || visited.has(node.id)) return node?.type
    visited.add(node.id)
    const binding = node.ports.find(p => p.id === portId)?.binding
    const nested = project.subworkflows.find(g => g.id === node.config.subworkflowId)
    return binding ? endpointType(nested?.nodes.find(n => n.id === binding.nodeId), binding.portId, visited) : node.type
  }
  if (edge.type === 'tool-access' && (endpointType(source, edge.sourcePort) !== 'agent' || endpointType(target, edge.targetPort) !== 'tool')) problems.push({ code: 'invalid-tool-access', message: 'Tool access соединяет Agent → Tool (включая открытые порты Subworkflow).' })
  return problems
}
