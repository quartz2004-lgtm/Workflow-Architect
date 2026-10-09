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
