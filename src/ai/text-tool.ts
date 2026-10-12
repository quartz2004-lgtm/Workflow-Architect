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

import { z } from 'zod'
import { countWords, type AgentTool } from './agent'

const argumentsSchema = z.strictObject({ text: z.string().max(100000).optional() })

/** Pure built-in: no service account, filesystem or external effects. */
export function textStatistics(text: string, minimumWords: number) {
  z.string().max(100000).parse(text)
  z.number().int().min(0).max(5000).parse(minimumWords)
  const words = countWords(text)
  return { words, characters: [...text].length, paragraphs: text.trim() ? text.trim().split(/\n\s*\n/u).length : 0,
    headings: text.split(/\r?\n/u).filter(line => /^#{1,6}\s+\S/u.test(line)).length,
    minimumWords, meetsMinimum: words >= minimumWords }
}
export function createTextTool(name: string, inputText: string, minimumWords: number): AgentTool {
  return { name, description: 'Count words, characters, paragraphs and Markdown headings. Without text argument, inspect the original input text. Does not verify facts.',
    parameters: { type: 'object', properties: { text: { type: 'string', maxLength: 100000 } }, additionalProperties: false },
    async execute(raw, signal) { signal.throwIfAborted(); const args = argumentsSchema.parse(raw); return textStatistics(args.text ?? inputText, minimumWords) },
  }
}
