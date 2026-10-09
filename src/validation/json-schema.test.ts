import { describe, expect, it } from 'vitest'
import { jsonSchemaProblem } from './json-schema'

describe('precompiled JSON metaschemas', () => {
  it('validates draft-07 and 2020-12 without runtime code generation', () => {
    const original = globalThis.Function
    globalThis.Function = function () { throw new Error('Runtime compilation is forbidden') } as unknown as FunctionConstructor
    try {
      expect(jsonSchemaProblem({ type: 'object', properties: { name: { type: 'string' } } })).toBeNull()
      expect(jsonSchemaProblem({ type: 'wrong' })).toContain('type')
      expect(jsonSchemaProblem({ $schema: 'https://json-schema.org/draft/2020-12/schema', prefixItems: [{ type: 'string' }], unevaluatedProperties: false })).toBeNull()
      expect(jsonSchemaProblem({ $schema: 'https://json-schema.org/draft/2020-12/schema', prefixItems: 'wrong' })).toContain('prefixItems')
      expect(jsonSchemaProblem({ $schema: 'https://untrusted.invalid/schema' })).toContain('Внешние метасхемы')
      expect(jsonSchemaProblem(true)).toBeNull()
      expect(jsonSchemaProblem(false)).toBeNull()
    } finally { globalThis.Function = original }
  })
})
