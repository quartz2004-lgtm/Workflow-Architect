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
