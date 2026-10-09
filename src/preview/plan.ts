import { getGraph } from '../domain/graphs'
import type { Project } from '../domain/schema'

export interface PreviewStep { nodeId: string; graphId: string | null; title: string; viaEdgeIds: string[]; branch: boolean }
/** A bounded structural walk, not a scheduler or expression interpreter. */
export function previewPlan(project: Project, graphId: string | null): PreviewStep[] {
  const steps: PreviewStep[] = [], visitedGraphs = new Set<string | null>()
  const seen = new Set<string>()
  type Frame = { nodeId: string; graphId: string | null }
  const stack: Frame[] = []
  const graphs = new Map<string | null, ReturnType<typeof prepare>>()
  function prepare(id: string | null) {
    const graph = getGraph(project, id)
    const nodes = graph.nodes.filter(node => node.type !== 'note' && node.status !== 'disabled')
    const nodeIds = new Set(nodes.map(node => node.id))
    const edges = graph.edges.filter(edge => (edge.type === 'flow' || edge.type === 'data') && nodeIds.has(edge.sourceNode) && nodeIds.has(edge.targetNode))
    const incoming = new Map<string, typeof edges>(), outgoing = new Map<string, typeof edges>()
    for (const edge of edges) {
      incoming.set(edge.targetNode, [...incoming.get(edge.targetNode) ?? [], edge])
      outgoing.set(edge.sourceNode, [...outgoing.get(edge.sourceNode) ?? [], edge])
    }
    return { nodes, nodeMap: new Map(nodes.map(node => [node.id, node])), incoming, outgoing }
  }
  const enqueue = (id: string | null) => {
    if (visitedGraphs.has(id)) return
    visitedGraphs.add(id)
    const graph = prepare(id); graphs.set(id, graph)
    const roots = graph.nodes.filter(node => node.type === 'trigger' || !graph.incoming.has(node.id))
    const ordered = [...roots, ...graph.nodes.filter(node => !roots.includes(node))]
    stack.push(...ordered.reverse().map(node => ({ nodeId: node.id, graphId: id })))
  }
  enqueue(graphId)
  while (stack.length) {
    const { nodeId, graphId: id } = stack.pop()!
    if (seen.has(nodeId)) continue
    const graph = graphs.get(id)!, node = graph.nodeMap.get(nodeId)!
    seen.add(nodeId)
    const outgoing = graph.outgoing.get(nodeId) ?? []
    steps.push({ nodeId, graphId: id, title: node.title, viaEdgeIds: (graph.incoming.get(nodeId) ?? []).filter(edge => seen.has(edge.sourceNode)).map(edge => edge.id), branch: outgoing.length > 1 })
    stack.push(...outgoing.toReversed().map(edge => ({ nodeId: edge.targetNode, graphId: id })))
    if (node.type === 'subworkflow' && project.subworkflows.some(workflow => workflow.id === node.config.subworkflowId)) enqueue(node.config.subworkflowId!)
  }
  return steps
}
