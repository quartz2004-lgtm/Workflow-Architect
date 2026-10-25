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

import type { Graph, WorkflowNode } from '../domain/schema'

/** A publication cannot bypass exact Human approval through a side edge or shared entry. */
export function validateEditorialPlan(graph: Graph, node: WorkflowNode): void {
  if (node.type !== 'agent' || node.operation?.kind !== 'agent' || !node.operation.editorial) return
  if (!node.operation.knowledge?.collections.length) throw new Error('Для редакции выберите хотя бы одну коллекцию знаний.')
  if (node.operation.requireTools || node.config.toolIds?.length || node.config.output || node.config.context?.memory || node.config.context?.attachedNodeIds?.length) throw new Error('Редакция использует собственные этапы и досье; Tool, произвольный output и память другого узла здесь не поддерживаются.')
  const edges = graph.edges.filter(edge => edge.type === 'flow')
  const incoming = edges.filter(edge => edge.targetNode === node.id)
  if (!incoming.length || incoming.some(edge => !['manual', 'telegram-message'].includes(graph.nodes.find(item => item.id === edge.sourceNode)?.operation?.kind ?? ''))) throw new Error('Редакционное задание начинается с Manual или Telegram.')
  const exits = edges.filter(edge => edge.sourceNode === node.id)
  const human = graph.nodes.find(item => item.id === exits[0]?.targetNode)
  if (exits.length !== 1 || exits[0]!.predicate || human?.operation?.kind !== 'human' || human.operation.mode !== 'approval' || human.status === 'disabled') throw new Error('После редакции нужен один обязательный Human с подтверждением.')
  if (human.operation.timeoutMs > 3600000) throw new Error('В редакционном процессе ожидание Human ограничено одним часом.')
  const finalEdges = edges.filter(edge => edge.sourceNode === human.id)
  const artifact = graph.nodes.find(item => item.id === finalEdges[0]?.targetNode)
  if (finalEdges.length !== 1 || finalEdges[0]!.predicate || artifact?.operation?.kind !== 'artifact' || artifact.operation.format !== 'text' || artifact.operation.source.kind !== 'input' || artifact.operation.source.pointer !== '/version/text' || artifact.status === 'disabled') throw new Error('После Human нужен текстовый Artifact с источником /version/text.')
  if (edges.filter(edge => edge.targetNode === human.id).length !== 1 || edges.filter(edge => edge.targetNode === artifact.id).length !== 1 || edges.some(edge => edge.sourceNode === artifact.id)) throw new Error('Human и Artifact редакции не должны иметь обходных входов или продолжения публикации.')
  const protectedIds = new Set([node.id, human.id, artifact.id])
  if (graph.edges.some(edge => ['data', 'tool-access'].includes(edge.type) && (protectedIds.has(edge.sourceNode) || protectedIds.has(edge.targetNode)))) throw new Error('Данные редакционной версии проходят только через подтверждённую Flow-цепочку.')
}
