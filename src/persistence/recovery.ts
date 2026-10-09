import { z } from 'zod'
import { assertPortableSnapshot } from '../domain/limits'
import { createId, createNode, createProject } from '../domain/factories'
import { nodeSchema, projectSchema, type Project } from '../domain/schema'
import { assertNoObviousSecrets, parseProject } from '../domain/serialization'

export interface RecoveryIssue { path: string; message: string; entityId?: string; original?: unknown }
export interface RecoveryReport { raw: string; project: Project | null; issues: RecoveryIssue[] }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Best-effort recovery is explicit, version-bounded and always creates a new project. */
export function recoverProject(raw: string): RecoveryReport {
  const report: RecoveryReport = { raw, project: null, issues: [] }
  const add = (path: string, message: string, entityId?: string, original?: unknown) => report.issues.push({ path, message, entityId, original })
  let value: Record<string, unknown>
  try {
    assertPortableSnapshot(raw)
    value = record(JSON.parse(raw))
    if (value.schemaVersion !== '0.1') throw new Error('Автоматическое восстановление поддерживает только schemaVersion 0.1.')
  } catch (error) { add('project', error instanceof Error ? error.message : 'Некорректный JSON.'); return report }
  const safe = (schema: z.ZodType, candidate: unknown) => {
    try { assertNoObviousSecrets(candidate); return schema.safeParse(candidate) }
    catch { return { success: false as const } }
  }
  const fields = (schema: z.ZodObject, source: unknown, fallback: Record<string, unknown>, path: string, entityId?: string): Record<string, unknown> => {
    const input = record(source), output = { ...fallback }
    for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodType][]) {
      const parsed = safe(field, input[key])
      if (parsed.success) output[key] = parsed.data
      else {
        const unwrapped = field instanceof z.ZodOptional ? field.unwrap() : field
        if (unwrapped instanceof z.ZodObject && input[key] && typeof input[key] === 'object') {
          const partial = fields(unwrapped, input[key], record(fallback[key]), `${path}.${key}`, entityId)
          const checked = safe(field, partial)
          if (checked.success) { output[key] = checked.data; continue }
        }
        add(`${path}.${key}`, 'Некорректное поле пропущено или заменено безопасным значением.', entityId)
      }
    }
    for (const key of Object.keys(input)) if (!(key in schema.shape)) add(`${path}.${key}`, 'Неизвестное поле исключено из восстановленной копии.', entityId)
    return output
  }
  const list = <T>(schema: z.ZodType<T>, source: unknown, path: string): T[] => {
    if (!Array.isArray(source)) { add(path, 'Список отсутствует или повреждён; восстановлен пустой список.'); return [] }
    return source.slice(0, 50_000).flatMap((item: unknown, index) => {
      const parsed = safe(schema, item)
      if (parsed.success) return [parsed.data as T]
      add(`${path}[${index}]`, 'Повреждённая запись исключена. Оригинал доступен в исходном JSON.', typeof record(item).id === 'string' ? record(item).id as string : undefined, item)
      return []
    })
  }
  const nodes = (source: unknown, path: string) => {
    if (!Array.isArray(source)) { add(path, 'Список узлов повреждён.'); return [] }
    const ids = new Set<string>()
    return source.slice(0, 10_000).flatMap((item: unknown, index) => {
      const input = record(item), parsed = safe(nodeSchema, item)
      const schema = nodeSchema.options.find(option => option.shape.type.value === input.type) ?? nodeSchema.options[0]!
      const fallback = createNode(schema.shape.type.value)
      const id = z.uuid().safeParse(input.id).success ? input.id as string : fallback.id
      if (ids.has(id)) { add(`${path}[${index}]`, 'Повторяющийся узел исключён, чтобы сохранить однозначные ID.', id, item); return [] }
      ids.add(id)
      if (parsed.success) return [parsed.data as Project['nodes'][number]]
      add(`${path}[${index}]`, 'Узел восстановлен частично. Откройте его на Canvas и проверьте конфигурацию.', id, item)
      const repaired = fields(schema, input, { ...fallback, id }, `${path}[${index}]`, id)
      repaired.ports = list(schema.shape.ports.element, input.ports, `${path}[${index}].ports`)
      repaired.status = 'draft'
      return [nodeSchema.parse(repaired)]
    })
  }
  try {
    const fresh = createProject(), metadata = fields(projectSchema.shape.project, value.project, fresh.project, 'project')
    const graph = (input: Record<string, unknown>, path: string) => ({ nodes: nodes(input.nodes, `${path}.nodes`), edges: list(projectSchema.shape.edges.element, input.edges, `${path}.edges`), groups: list(projectSchema.shape.groups.element, input.groups, `${path}.groups`) })
    const subworkflows = Array.isArray(value.subworkflows) ? value.subworkflows.flatMap((item: unknown, index) => {
      const input = record(item), schema = projectSchema.shape.subworkflows.element, path = `subworkflows[${index}]`
      const metadata = Object.fromEntries(Object.entries(input).filter(([key]) => !['nodes', 'edges', 'groups'].includes(key)))
      const shell = fields(schema.omit({ nodes: true, edges: true, groups: true }), metadata, { id: createId(), title: 'Восстановленный Subworkflow', description: '', ports: [] }, path)
      return [{ ...shell, ...graph(input, path) }]
    }) : []
    report.project = parseProject({ ...fresh, ...graph(value, 'root'), project: { ...metadata, id: fresh.project.id, name: `${String(metadata.name).slice(0, 275)} — восстановлено`, createdAt: fresh.project.createdAt, updatedAt: fresh.project.updatedAt },
      settings: fields(projectSchema.shape.settings, value.settings, fresh.settings, 'settings'),
      schemas: list(projectSchema.shape.schemas.element, value.schemas, 'schemas'), prompts: list(projectSchema.shape.prompts.element, value.prompts, 'prompts'), subworkflows,
    })
  } catch (error) { add('project', `Не удалось собрать совместимую копию: ${error instanceof Error ? error.message : String(error)}`) }
  return report
}
