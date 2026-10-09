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
