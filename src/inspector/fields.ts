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

import type { NodeType } from '../domain/schema'
import type { FieldHelpKey } from '../help/field-help'

export interface ConfigField {
  helpKey?: FieldHelpKey
  path: string
  label: string
  kind: 'text' | 'multiline' | 'number' | 'select' | 'list' | 'json' | 'contract' | 'prompt' | 'node-ref' | 'node-list' | 'prompt-ref'
  options?: readonly string[]
  nodeType?: NodeType
}
export interface ConfigSection { title: string; fields: ConfigField[] }
const contracts: ConfigSection = { title: 'Контракты', fields: [
  { path: 'input', label: 'Входной контракт', kind: 'contract' }, { path: 'output', label: 'Выходной контракт', kind: 'contract' },
] }
const execution: ConfigSection = { title: 'Execution metadata', fields: [
  { path: 'execution.timeoutMs', label: 'Timeout (ms)', kind: 'number' },
  { path: 'execution.retries', label: 'Retries', kind: 'number' },
  { path: 'execution.fallbackNodeId', label: 'Fallback', kind: 'node-ref' },
  { path: 'execution.errorPolicy', label: 'Обработка ошибок', kind: 'multiline' },
] }
export const inspectorSections: Record<NodeType, ConfigSection[]> = {
  concept: [], note: [],
  agent: [
    { title: 'Роль и инструкции', fields: [
      { path: 'role', label: 'Роль', kind: 'text' },
      { path: 'systemPrompt', label: 'System prompt', kind: 'prompt' },
      { path: 'promptId', label: 'Prompt reference', kind: 'prompt-ref' },
      { path: 'behavioralRules', label: 'Правила поведения', kind: 'list' },
    ] },
    { title: 'Модель', fields: [
      { path: 'model.provider', label: 'Provider', kind: 'text' }, { path: 'model.name', label: 'Model', kind: 'text' },
      { path: 'model.parameters', label: 'Параметры модели (JSON)', kind: 'json' },
    ] },
    { title: 'Контекст', fields: [
      { path: 'context.memory', label: 'Память', kind: 'text' }, { path: 'context.knowledge', label: 'Источники знаний', kind: 'multiline' },
      { path: 'context.attachedNodeIds', label: 'Прикреплённые данные', kind: 'node-list' }, { path: 'context.policy', label: 'Политика контекста', kind: 'multiline' },
    ] },
    { title: 'Инструменты', fields: [
      { path: 'toolIds', label: 'Connected tools', kind: 'node-list', nodeType: 'tool' }, { path: 'permissions', label: 'Разрешения', kind: 'list' },
    ] }, contracts, execution,
  ],
  tool: [
    { title: 'Инструмент', fields: [
      { path: 'category', label: 'Категория', kind: 'text' }, { path: 'provider', label: 'Provider', kind: 'text' }, { path: 'reference', label: 'Endpoint / reference', kind: 'text' },
      { path: 'authentication.type', label: 'Authentication', kind: 'select', options: ['none', 'environment', 'credential-ref'] },
      { path: 'authentication.reference', label: 'Имя ENV / credential ID', kind: 'text' }, { path: 'permissions', label: 'Разрешения', kind: 'list' },
    ] }, contracts,
  ],
  trigger: [{ title: 'Триггер', fields: [
    { path: 'triggerType', label: 'Trigger type', kind: 'select', options: ['manual', 'webhook', 'schedule', 'event', 'message', 'file', 'api-call'] },
    { path: 'source', label: 'Источник', kind: 'text' }, { path: 'payload', label: 'Payload schema', kind: 'contract' },
  ] }],
  logic: [{ title: 'Логика', fields: [
    { path: 'logicType', label: 'Logic type', kind: 'select', options: ['if', 'switch', 'router', 'loop', 'merge', 'parallel', 'retry', 'gate'] },
    { path: 'conditions', label: 'Условия', kind: 'list' }, { path: 'expression', label: 'Выражение', kind: 'multiline' },
  ] }],
  data: [{ title: 'Данные', fields: [
    { path: 'dataType', label: 'Data type', kind: 'select', options: ['json', 'database', 'table', 'file', 'vector-store', 'state', 'memory-store'] },
    { path: 'persistence', label: 'Тип хранения', kind: 'text' }, { path: 'source', label: 'Источник', kind: 'text' }, { path: 'schema', label: 'Схема данных', kind: 'contract' },
  ] }],
  human: [{ title: 'Участие человека', fields: [
    { path: 'interactionType', label: 'Interaction type', kind: 'select', options: ['confirmation', 'approval', 'manual-input', 'review', 'decision'] },
    { path: 'instruction', label: 'Вопрос / инструкция', kind: 'multiline' }, { path: 'response', label: 'Ожидаемый ответ', kind: 'contract' },
  ] }, execution],
  artifact: [{ title: 'Результат', fields: [
    { path: 'artifactType', label: 'Artifact type', kind: 'select', options: ['document', 'code', 'image', 'video', 'report', 'dataset', 'file', 'json'] },
    { path: 'format', label: 'Формат', kind: 'text' }, { path: 'storageTarget', label: 'Место хранения', kind: 'text' }, { path: 'schema', label: 'Схема результата', kind: 'contract' },
  ] }],
  subworkflow: [contracts],
}
