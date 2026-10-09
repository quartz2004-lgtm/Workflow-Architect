import type { Graph, Project } from './schema'

export function getGraph(project: Project, graphId: string | null = null): Graph {
  if (!graphId) return project
  const graph = project.subworkflows.find(g => g.id === graphId)
  if (!graph) throw new Error('Вложенный граф не найден.')
  return graph
}

export function graphEntries(project: Project): { id: string | null; title: string; graph: Graph }[] {
  return [{ id: null, title: project.project.name, graph: project }, ...project.subworkflows.map(graph => ({ id: graph.id, title: graph.title, graph }))]
}

/** Returns one reachable breadcrumb path; graph IDs keep names out of identity. */
export function graphPath(project: Project, target: string | null): (string | null)[] {
  const visit = (id: string | null, path: (string | null)[]): (string | null)[] | undefined => {
    if (id === target) return path
    for (const node of getGraph(project, id).nodes) {
      if (node.type !== 'subworkflow' || !node.config.subworkflowId || path.includes(node.config.subworkflowId)) continue
      if (!project.subworkflows.some(g => g.id === node.config.subworkflowId)) continue
      const result = visit(node.config.subworkflowId, [...path, node.config.subworkflowId])
      if (result) return result
    }
  }
  return visit(null, [null]) ?? (target ? [null, target] : [null])
}
