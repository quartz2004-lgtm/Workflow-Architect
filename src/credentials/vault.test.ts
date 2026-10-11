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

import { afterEach, describe, expect, it } from 'vitest'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CredentialVault, type SecretCipher } from './vault'
import { SecretRedactor } from './redactor'
import { credentialCommandSchema } from './schema'
import { profileIds } from '../profiles/schema'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-credential-unit-')); directories.push(directory)
  const key = randomBytes(32)
  const cipher: SecretCipher = {
    available: async () => true,
    encrypt: async text => {
      const iv = randomBytes(12), aes = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([aes.update(text, 'utf8'), aes.final()])
      return Buffer.concat([iv, aes.getAuthTag(), data])
    },
    decrypt: async bytes => {
      const aes = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); aes.setAuthTag(bytes.subarray(12, 28))
      return { result: Buffer.concat([aes.update(bytes.subarray(28)), aes.final()]).toString('utf8'), shouldReEncrypt: false }
    },
  }
  const input = { id: randomUUID(), profileId: profileIds[0], label: 'Article service', service: 'Test provider', secret: 'synthetic-only-secret-42', enabled: false }
  return { directory, cipher, input, vault: new CredentialVault(directory, cipher) }
}
describe('profile-owned encrypted credentials', () => {
  it('persists only ciphertext; returns only metadata; reloads and explicitly grants access', async () => {
    const { directory, cipher, input, vault } = fixture(); await vault.initialize()
    const view = await vault.create(input)
    expect(view).not.toHaveProperty('ciphertext'); expect(JSON.stringify(view)).not.toContain(input.secret)
    expect(readFileSync(join(directory, `${input.id}.json`), 'utf8')).not.toContain(input.secret)
    await expect(vault.resolve(input.profileId, input.id)).rejects.toThrow('отозвано')
    await vault.setEnabled(input.profileId, input.id, true)
    const reopened = new CredentialVault(directory, cipher); await reopened.initialize()
    expect(await reopened.resolve(input.profileId, input.id)).toBe(input.secret)
    expect(reopened.list(profileIds[1])).toEqual([])
    await expect(reopened.resolve(profileIds[1], input.id)).rejects.toThrow('профилю')
    await expect(reopened.remove(profileIds[1], input.id)).rejects.toThrow('профилю')
    expect(credentialCommandSchema.safeParse({ kind: 'resolve', profileId: input.profileId, id: input.id }).success).toBe(false)
    expect(() => reopened.assertNoSecrets({ input: input.secret })).toThrow('credential ID')
    await reopened.remove(input.profileId, input.id)
    expect(readdirSync(directory)).toEqual([])
    expect(reopened.redactor.redact(input.secret)).toBe('[REDACTED]')
  })
  it('revocation wins against an in-flight decryption', async () => {
    const { cipher, input, vault } = fixture(); await vault.initialize(); await vault.create({ ...input, enabled: true })
    const original = cipher.decrypt
    let finish!: (value: { result: string; shouldReEncrypt: boolean }) => void
    cipher.decrypt = () => new Promise(resolve => { finish = resolve })
    const pending = vault.resolve(input.profileId, input.id)
    await vault.setEnabled(input.profileId, input.id, false)
    finish({ result: input.secret, shouldReEncrypt: false })
    await expect(pending).rejects.toThrow('изменилось')
    cipher.decrypt = original
    await expect(vault.resolve(input.profileId, input.id)).rejects.toThrow('отозвано')
  })
  it('fails closed without encryption and does not poison the mutation queue', async () => {
    const { directory, cipher, input, vault } = fixture(); cipher.available = async () => false; await vault.initialize()
    await expect(vault.create(input)).rejects.toThrow('не сохранён'); expect(readdirSync(directory)).toEqual([])
    cipher.available = async () => true
    const original = cipher.encrypt; cipher.encrypt = async () => { throw new Error('native failure') }
    await expect(vault.create(input)).rejects.toThrow('native failure'); expect(readdirSync(directory)).toEqual([])
    cipher.encrypt = original; await vault.create(input); expect(vault.list(input.profileId)).toHaveLength(1)
  })
  it('retains damaged and undecryptable files, and rotates encrypted records on reopen', async () => {
    const { directory, cipher, input, vault } = fixture(); await vault.initialize(); await vault.create(input)
    const decrypt = cipher.decrypt; cipher.decrypt = async value => ({ ...await decrypt(value), shouldReEncrypt: true })
    const rotated = new CredentialVault(directory, cipher); await rotated.initialize()
    expect(rotated.list(input.profileId)[0]!.revision).toBe(1)
    const damaged = randomUUID(); writeFileSync(join(directory, `${damaged}.json`), '{invalid')
    cipher.decrypt = async () => { throw new Error('wrong OS key') }
    const unavailable = new CredentialVault(directory, cipher); await unavailable.initialize()
    expect(unavailable.status()).toEqual({ available: true, damaged: [damaged], unavailable: 1 })
    expect(unavailable.list(input.profileId)[0]!.available).toBe(false)
    await expect(unavailable.setEnabled(input.profileId, input.id, true)).rejects.toThrow('восстановите')
    expect(readFileSync(join(directory, `${damaged}.json`), 'utf8')).toBe('{invalid')
  })
  it('rejects secrets in public metadata', async () => {
    const { input, vault } = fixture(); await vault.initialize()
    await expect(vault.create({ ...input, label: input.secret })).rejects.toThrow('название')
    expect(vault.list(input.profileId)).toEqual([])
  })
})
it('redacts raw, JSON escaped, URI encoded and common authorization values', () => {
  const redactor = new SecretRedactor(), secret = 'test-only:with"quote/and space'
  redactor.add(secret)
  for (const text of [secret, JSON.stringify(secret), encodeURIComponent(secret)]) {
    expect(redactor.redact(text)).toContain('[REDACTED]')
    expect(redactor.redact(text)).not.toContain(secret)
  }
  expect(redactor.redact('Authorization: Bearer synthetic-token')).toBe('Authorization: Bearer [REDACTED]')
  expect(redactor.contains({ nested: [encodeURIComponent(secret)] })).toBe(true)
})
