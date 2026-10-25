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

import { join } from 'node:path'

export function loadKnowledge(appPath: string, directory: string): { handle(value: unknown): Promise<unknown> } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Fixed bundled native module, never a renderer-supplied path.
  const module = require(join(appPath, 'runtime-dist', 'knowledge.cjs')) as { createNativeKnowledge(directory: string): { handle(value: unknown): Promise<unknown> } }
  return module.createNativeKnowledge(directory)
}
