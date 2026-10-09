import draft07 from './generated/draft07'
import draft2020 from './generated/draft2020'

// Trusted metaschemas are compiled at build time, never in the browser/renderer.
const cache = new WeakMap<object, string | null>()
export function jsonSchemaProblem(schema: unknown): string | null {
  if (typeof schema === 'boolean') return null
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return 'JSON Schema должна быть объектом или boolean.'
  if (cache.has(schema)) return cache.get(schema) ?? null
  const dialect = '$schema' in schema ? schema.$schema : undefined
  if (dialect !== undefined && dialect !== 'http://json-schema.org/draft-07/schema' && dialect !== 'http://json-schema.org/draft-07/schema#' && dialect !== 'https://json-schema.org/draft/2020-12/schema') {
    return 'Поддерживаются JSON Schema draft-07 и 2020-12. Внешние метасхемы не загружаются.'
  }
  const validator = dialect === 'https://json-schema.org/draft/2020-12/schema' ? draft2020 : draft07
  let error: string | null = null
  try { if (!validator(schema)) error = validator.errors?.map(issue => `data${issue.instancePath} ${issue.message}`).join('; ') ?? 'Неверная JSON Schema.' }
  catch { error = 'Поддерживаются JSON Schema draft-07 и 2020-12. Внешние метасхемы не загружаются.' }
  cache.set(schema, error)
  return error
}
