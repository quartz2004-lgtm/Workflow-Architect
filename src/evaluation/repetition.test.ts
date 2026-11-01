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

import { expect, it } from 'vitest'
import { measureSentenceRepetition } from './repetition'

it('finds a repeated sentence inside otherwise different paragraphs', () => {
  const sentence = 'Перед покупкой проверьте размер изделия и уточните наличие выбранного набора.'
  const result = measureSentenceRepetition(`## Заголовок без пустой строки\n${sentence} Это первый абзац.\n\nДругой вводный текст. ${sentence.toUpperCase().replaceAll(' ', '  ')}`)
  expect(result).toMatchObject({ eligibleSentences: 2, repeatedOccurrences: 1, repeatedRate: 0.5, distinctRepeatedSentences: 1 })
  expect(result.samples[0]?.sample).toBe(sentence)
})

it('does not interpret paraphrases, different numbers or short labels as duplicates', () => {
  const result = measureSentenceRepetition('В составе основной ткани указано ровно 69,8 процента хлопка. В составе основной ткани указано ровно 66,6 процента хлопка.\n\nСостав ткани. Состав ткани.')
  expect(result).toMatchObject({ eligibleSentences: 2, repeatedOccurrences: 0, repeatedRate: 0 })
  expect(measureSentenceRepetition('# Повтор заголовка\n\n# Повтор заголовка')).toMatchObject({ eligibleSentences: 0, repeatedRate: null })
})
