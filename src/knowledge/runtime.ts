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

import { z } from 'zod'
import type { Project } from '../domain/schema'
import type { JsonValue } from '../domain/execution-config'
import { graphEntries } from '../domain/graphs'
import { assertValueBudget } from '../execution/values'
import { buildContextPacket, contextPacketSchema, type ContextPacket } from './context'
import type { KnowledgeService } from './service'
import type { AgentKnowledge } from '../domain/knowledge-config'
import type { MediaStore } from './media-store'
import { resolveContract } from '../execution/compiler'
import { normalizeEditorialTask } from '../editorial/schema'

export const preparedKnowledgeSchema = z.array(z.strictObject({
  nodeId: z.uuid(), collectionIds: z.array(z.uuid()).max(4), packet: contextPacketSchema,
})).max(100).refine(items => new Set(items.map(item => item.nodeId)).size === items.length, 'Повторный пакет узла.')
export type PreparedKnowledge = z.infer<typeof preparedKnowledgeSchema>
export type KnowledgeResolver = (nodeId: string) => ContextPacket
export interface RuntimeKnowledge {
  prepare(profileId: string, runId: string, project: Project, input: JsonValue): PreparedKnowledge
  resolve(profileId: string, runId: string, prepared: PreparedKnowledge, nodeId: string): ContextPacket
}

export function prepareContext(knowledge: Pick<KnowledgeService, 'capture'>, profileId: string, runId: string, config: AgentKnowledge, task: string, media?: Pick<MediaStore, 'capture'>, handoff?: ContextPacket['handoff']): ContextPacket {
  if (config.imageIds.length && !media) throw new Error('Хранилище фотографий недоступно. Изображения не будут молча пропущены.')
  const query = config.query || task
  if (query.length > 4000) throw new Error('Исходная задача слишком длинна для поискового запроса. Укажите отдельный запрос в источниках Agent.')
  const packet = buildContextPacket({ profileId: projectProfile(profileId), runId, task, query, sku: config.sku || undefined,
    sourceIds: config.sourceIds, maxBytes: config.maxBytes, maxExcerpts: config.maxExcerpts, handoff }, knowledge.capture(profileId, config.collections))
  if (config.imageIds.length) packet.images = media!.capture(profileId, config.imageIds, config.sku)
  return packet
}

/** Native reader only. The desktop main process remains the sole collection writer. */
export class KnowledgeRuntime implements RuntimeKnowledge {
  constructor(private readonly knowledge: Pick<KnowledgeService, 'capture' | 'assertAllowed'>, private readonly media?: Pick<MediaStore, 'capture' | 'assertAllowed'>) {}
  prepare(profileId: string, runId: string, project: Project, input: JsonValue): PreparedKnowledge {
    const result: PreparedKnowledge = []
    for (const { graph } of graphEntries(project)) for (const node of graph.nodes) {
      if (node.status === 'disabled' || node.type !== 'agent' || node.operation?.kind !== 'agent' || !node.operation.knowledge) continue
      const config = node.operation.knowledge
      if (!config.collections.length && !config.imageIds.length) continue
      const editorialTask = node.operation.editorial ? normalizeEditorialTask(input, node.operation.minimumWords || 600) : undefined
      const task = editorialTask ? JSON.stringify(editorialTask) : typeof input === 'string' ? input : JSON.stringify(input)
      const outputContract = node.config.output ? resolveContract(node.config.output, project) : undefined
      const packet = prepareContext(this.knowledge, profileId, runId, editorialTask ? { ...config, query: config.query || editorialTask.text } : config, task, this.media, {
        taskId: runId, nodeId: node.id, mode: 'local', model: node.config.model?.name ?? '',
        minimumWords: node.operation.minimumWords, format: outputContract === undefined ? 'text' : 'json-schema',
        ...(outputContract === undefined ? {} : { outputContract }),
        instructions: [node.config.role, node.config.promptId ? project.prompts.find(prompt => prompt.id === node.config.promptId)?.content : '', node.config.systemPrompt, ...(node.config.behavioralRules ?? [])].filter(Boolean).join('\n\n'),
        editorialFreedom: 'Свободно улучшай структуру, стиль и подачу в рамках задания. Сохраняй проверяемые факты, условия их применимости и неизвестные сведения. Не превращай визуальные наблюдения в подтверждённые свойства товара.',
      })
      result.push({ nodeId: node.id, collectionIds: config.collections.map(item => item.collectionId), packet })
    }
    assertValueBudget(result, 4 * 1024 * 1024, true)
    return preparedKnowledgeSchema.parse(result)
  }
  resolve(profileId: string, runId: string, prepared: PreparedKnowledge, nodeId: string): ContextPacket {
    const entry = prepared.find(item => item.nodeId === nodeId)
    if (!entry || entry.packet.profileId !== profileId || entry.packet.runId !== runId) throw new Error('Пакет источников не принадлежит этому узлу, профилю или запуску.')
    this.knowledge.assertAllowed(profileId, entry.collectionIds)
    if (entry.packet.images?.length) {
      if (!this.media) throw new Error('Хранилище фотографий недоступно.')
      this.media.assertAllowed(profileId, entry.packet.images.map(image => image.id))
    }
    return structuredClone(entry.packet)
  }
}
const projectProfile = (profileId: string) => contextPacketSchema.shape.profileId.parse(profileId)
