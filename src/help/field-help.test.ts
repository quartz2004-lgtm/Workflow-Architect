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
import { inspectorSections } from '../inspector/fields'
import { chapters, chapterText } from './content'
import { configHelpKey, fieldHelp } from './field-help'

describe('field documentation', () => {
  it('documents every registered configuration field and links to an existing chapter', () => {
    for (const [type, sections] of Object.entries(inspectorSections)) {
      for (const section of sections) for (const field of section.fields) {
        expect(field.helpKey ?? configHelpKey(type, field.path), `${type}.${field.path}`).toBeDefined()
      }
    }
    for (const help of Object.values(fieldHelp)) {
      const chapter = chapters.find(chapter => chapter.id === help.chapter)
      expect(chapter, help.label).toBeDefined()
      expect(chapterText(chapter!)).toContain(help.text)
    }
  })
})
