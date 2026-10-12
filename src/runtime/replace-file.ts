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

import { renameSync } from 'node:fs'

/** A Windows reader/scanner may briefly deny atomic replacement. Never delete the destination. */
export function replaceFile(source: string, destination: string, options: {
  platform?: NodeJS.Platform; rename?: typeof renameSync; sleep?: (milliseconds: number) => void
} = {}): void {
  const rename = options.rename ?? renameSync
  const sleep = options.sleep ?? (milliseconds => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds) })
  for (let attempt = 0; ; attempt++) {
    try { rename(source, destination); return }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined
      if ((options.platform ?? process.platform) !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(String(code)) || attempt >= 5) throw error
      // At most 310 ms in the isolated runtime; persistent errors still fail closed.
      sleep(10 * 2 ** attempt)
    }
  }
}
