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
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SourceContent } from './SourceContent'

describe('readable untrusted source excerpts', () => {
  it('retains source scope, unknown keys and false values without executing markup', () => {
    const content = JSON.stringify({ sourceContext: [{ scope: 'Только выбранная модель' }], record: {
      availability: 'Наличие уточняется', constructor: '<script>unsafe()</script>', unexpected: false,
      zero: 0, absent: null, list: ['Первое', 'Второе'],
    } })
    const html = renderToStaticMarkup(createElement(SourceContent, { content }))
    for (const value of ['Условия источника', 'Только выбранная модель', 'Наличие', 'Наличие уточняется',
      'constructor', 'unexpected', 'false', '0', 'null', 'Первое', 'Второе', 'Точный исходный фрагмент']) expect(html).toContain(value)
    expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
  it('shows plain or malformed source text safely without silently discarding it', () => {
    const html = renderToStaticMarkup(createElement(SourceContent, { content: '{incomplete: <img src=x onerror=unsafe()>\nУсловие источника' }))
    expect(html).toContain('Условие источника')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
  })
})
