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

/** Diagnostic only. Repetition may be intentional; absence does not prove quality. */
export function measureSentenceRepetition(text: string) {
  const counts = new Map<string, { sample: string; occurrences: number }>()
  const segmenter = new Intl.Segmenter('ru', { granularity: 'sentence' })
  let eligibleSentences = 0
  for (const paragraph of text.replace(/^[ \t]*#{1,6}[ \t]+[^\r\n]*$/gm, '').split(/\r?\n\s*\r?\n/)) {
    for (const { segment } of segmenter.segment(paragraph)) {
      const sentence = segment.normalize('NFC').trim().replace(/\s+/gu, ' ')
      if ((sentence.match(/[\p{L}\p{N}]+/gu) ?? []).length < 8) continue
      eligibleSentences++
      const key = sentence.toLocaleLowerCase('ru')
      const previous = counts.get(key)
      if (previous) previous.occurrences++
      else counts.set(key, { sample: sentence.slice(0, 240), occurrences: 1 })
    }
  }
  const repeated = [...counts.values()].filter(item => item.occurrences > 1)
  const repeatedOccurrences = repeated.reduce((sum, item) => sum + item.occurrences - 1, 0)
  return { method: 'ru-sentence-exact-nfc-case-space-v1', minimumWords: 8,
    eligibleSentences, repeatedOccurrences,
    repeatedRate: eligibleSentences ? repeatedOccurrences / eligibleSentences : null,
    distinctRepeatedSentences: repeated.length, samples: repeated.slice(0, 10) }
}
