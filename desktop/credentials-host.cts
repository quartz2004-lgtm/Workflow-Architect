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

export interface CredentialsHost {
  resolve(profileId: string, id: string): Promise<string>
  handle(value: unknown): Promise<unknown>
  assertNoSecrets(value: unknown): void
  redact(text: string): string
}
export async function loadCredentials(appPath: string, directory: string): Promise<CredentialsHost> {
  // A fixed, bundled application module; the renderer never supplies a module path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS bundle loaded from the packaged app, including ASAR.
  const module = require(join(appPath, 'runtime-dist', 'credentials.cjs')) as { createNativeVault(directory: string): Promise<CredentialsHost> }
  return module.createNativeVault(directory)
}
