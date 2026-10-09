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

import { nodeSchema, type WorkflowNode } from './schema'

/** Declarative Inspector paths are internal constants, never imported executable expressions. */
export function readConfig(config: unknown, path: string): unknown {
  let value = config
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

export function configureNode(node: WorkflowNode, path: string, value: unknown): WorkflowNode {
  const config: Record<string, unknown> = structuredClone(node.config)
  if (path.startsWith('model.') && !config.model) config.model = { provider: '', name: '' }
  if (path.startsWith('authentication.') && !config.authentication) config.authentication = { type: 'none' }
  const keys = path.split('.')
  if (keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) throw new Error('Недопустимый путь конфигурации.')
  let target = config
  for (const key of keys.slice(0, -1)) {
    if (!target[key]) target[key] = {}
    if (typeof target[key] !== 'object' || Array.isArray(target[key])) throw new Error('Некорректная структура конфигурации.')
    target = target[key] as Record<string, unknown>
  }
  const last = keys.at(-1)!
  if (value === undefined) delete target[last]
  else target[last] = value
  return nodeSchema.parse({ ...node, config })
}
