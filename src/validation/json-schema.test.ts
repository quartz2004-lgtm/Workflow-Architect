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
import { execFileSync } from 'node:child_process'

describe('precompiled JSON metaschemas', () => {
  it('resolves CommonJS default helpers in native Node for enum and const comparisons', () => {
    const modules = ['draft07', 'draft2020'].map(name => new URL(`./generated/${name}.js`, import.meta.url).href)
    const script = `
      for (const url of ${JSON.stringify(modules)}) {
        const { default: validate } = await import(url);
        const schema = { type: 'object', properties: { choice: { enum: ['red', 'blue'] }, fixed: { const: { enabled: true } } }, required: ['choice', 'fixed'] };
        if (!validate(schema)) throw new Error(JSON.stringify(validate.errors));
        if (validate({ required: ['same', 'same'] })) throw new Error('Duplicate required field accepted');
      }
    `
    expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', windowsHide: true })).not.toThrow()
  })
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
