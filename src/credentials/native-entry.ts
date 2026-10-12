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

import { safeStorage, clipboard } from 'electron'
import { CredentialError, CredentialVault } from './vault'
import { credentialCommandSchema } from './schema'
import { assertValueBudget } from '../execution/values'

export async function createNativeVault(directory: string) {
  const vault = new CredentialVault(directory, {
    available: async () => process.platform === 'win32' && await safeStorage.isAsyncEncryptionAvailable(),
    encrypt: value => safeStorage.encryptStringAsync(value),
    decrypt: value => safeStorage.decryptStringAsync(value),
  })
  await vault.initialize()
  return {
    assertNoSecrets: (value: unknown) => vault.assertNoSecrets(value),
    redact: (text: string) => vault.redactor.redact(text),
    handle: async (value: unknown): Promise<unknown> => {
      try {
        assertValueBudget(value, 128 * 1024, true)
        const parsed = credentialCommandSchema.safeParse(value)
        if (!parsed.success) throw new CredentialError('Некорректная команда хранилища подключений.')
        const command = parsed.data
        let result: unknown
        switch (command.kind) {
          case 'status': result = vault.status(); break
          case 'list': result = vault.list(command.profileId); break
          case 'create': result = await vault.create(command); break
          case 'set-enabled': result = await vault.setEnabled(command.profileId, command.id, command.enabled); break
          case 'remove': await vault.remove(command.profileId, command.id); result = null; break
          case 'copy-reference': clipboard.writeText(vault.reference(command.profileId, command.id)); result = null; break
        }
        return { ok: true, value: result }
      } catch (error) {
        // No raw native exception or command body crosses IPC or enters application logs.
        return { ok: false, message: error instanceof CredentialError ? vault.redactor.redact(error.message) : 'Не удалось выполнить операцию защищённого хранилища. Данные сохранены без изменений.' }
      }
    },
  }
}
