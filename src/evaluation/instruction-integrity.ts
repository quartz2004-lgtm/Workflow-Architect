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

import type { ProcessSnapshot } from '../editorial/process-schema'

/** Detect known lossy-decoding signatures, not language or editorial quality. */
export function instructionEncodingProblems(process?: ProcessSnapshot) {
  return Object.entries(process?.version.content.instructions ?? {}).flatMap(([role, text]) => {
    const replacementCharacters = (text.match(/\uFFFD/g) ?? []).length
    const questionMarks = (text.match(/\?/g) ?? []).length
    const lostWords = (text.match(/\?{2,}/g) ?? []).length
    return replacementCharacters || (lostWords >= 10 && questionMarks > text.length * 0.3)
      ? [{ role, characters: text.length, questionMarks, replacementCharacters }] : []
  })
}

export function assertReadableEvaluationInstructions(process?: ProcessSnapshot) {
  const problems = instructionEncodingProblems(process)
  if (problems.length) throw new Error(`Повреждена кодировка инструкции эксперимента: ${problems.map(item => item.role).join(', ')}. Подготовьте новый снимок UTF-8; прежние результаты не заменяются.`)
}
