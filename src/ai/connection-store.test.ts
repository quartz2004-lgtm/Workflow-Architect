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

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConnectionStore } from './connection-store'
import { profileIds } from '../profiles/schema'
import type { ModelCapabilities, ModelProvider } from './types'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) { if (!directory.startsWith(join(tmpdir(), 'wa-ai-'))) throw new Error('Unexpected test path'); rmSync(directory, { recursive: true, force: true }) } })
const configuration = { provider: 'ollama' as const, port: 11434, model: 'qwen3:8b' }
describe('profile-owned model connections', () => {
  it('persists metadata separately and never grants another profile access', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wa-ai-')); directories.push(directory)
    const store = new ConnectionStore(directory)
    store.save(profileIds[0], configuration, true)
    expect(new ConnectionStore(directory).state(profileIds[0]).connection?.configuration).toEqual(configuration)
    expect(store.state(profileIds[1]).connection).toBeNull()
    expect(() => store.resolve(profileIds[1], configuration.model)).toThrow('не подключена')
    expect(() => store.resolve(profileIds[0], 'other')).toThrow('не совпадает')
    store.save(profileIds[0], configuration, false)
    expect(() => store.resolve(profileIds[0], configuration.model)).toThrow('не подключена')
  })
  it('revocation wins over an in-flight provider even when it ignores abort', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wa-ai-')); directories.push(directory)
    let finish!: (value: ModelCapabilities) => void
    const provider: ModelProvider = { id: 'test', costPerMillionInput: 0, costPerMillionOutput: 0, async list() { return [] }, inspect() { return new Promise(resolve => { finish = resolve }) }, async chat() { throw new Error('unused') } }
    const store = new ConnectionStore(directory, () => provider)
    store.save(profileIds[0], configuration, true)
    const granted = store.resolve(profileIds[0], configuration.model)
    const pending = granted.inspect(configuration.model, new AbortController().signal)
    store.save(profileIds[0], configuration, false)
    finish({ tools: true, thinking: false, contextTokens: 4096 })
    await expect(pending).rejects.toThrow('отключено')
    await expect(granted.list(new AbortController().signal)).rejects.toThrow('отключено')
  })
})
