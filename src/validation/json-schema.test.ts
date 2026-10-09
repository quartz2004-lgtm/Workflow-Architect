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
