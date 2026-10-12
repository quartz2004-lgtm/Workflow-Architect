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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionStore } from './connection-store'
import { AssistantService } from './assistant-service'
import { createProfile, profileIds } from '../profiles/schema'
import { defaultAgentLimits } from './schema'
import { assistantTaskSchema, type AssistantTask } from './protocol'
import { runAgent } from './agent'
import type { ModelProvider } from './types'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) { if (!directory.startsWith(join(tmpdir(), 'wa-assistant-'))) throw new Error('Unexpected test path'); rmSync(directory, { recursive: true, force: true }) } })
function setup(chat: ModelProvider['chat']) {
  const directory = mkdtempSync(join(tmpdir(), 'wa-assistant-')); directories.push(directory)
  const provider: ModelProvider = { id: 'fake', costPerMillionInput: 0, costPerMillionOutput: 0, async list() { return [] }, async inspect() { return { tools: true, thinking: false, contextTokens: 32768 } }, chat }
  const connections = new ConnectionStore(directory, () => provider)
  connections.save(profileIds[0], { provider: 'ollama', port: 11434, model: 'qwen3:8b' }, true)
  return { service: new AssistantService(connections), connections }
}
const proposal = { message: 'Уточните цель', questions: ['Какой результат нужен?'], nodes: [], edges: [] }
const response = (output: unknown) => ({ content: JSON.stringify(output), toolCalls: [], inputTokens: 50, outputTokens: 50, finish: 'stop' as const })
async function finished(service: AssistantService, id: string): Promise<AssistantTask> {
  let task!: AssistantTask
  await vi.waitFor(async () => { task = assistantTaskSchema.parse(await service.handle({ action: 'get', profileId: profileIds[0], id })); expect(task.status).not.toBe('running') })
  return task
}
describe('assistant service boundary', () => {
  it('returns structured suggestions without applying them and enforces profile ownership', async () => {
    const { service } = setup(async () => response(proposal))
    const task = assistantTaskSchema.parse(await service.handle({ action: 'start', profileId: profileIds[0], input: { mode: 'design', conversation: [{ role: 'user', content: 'Помоги' }], graphSummary: '' } }))
    expect((await finished(service, task.id)).result).toEqual(proposal)
    await expect(service.handle({ action: 'get', profileId: profileIds[1], id: task.id })).rejects.toThrow('недоступен')
    await expect(service.handle({ action: 'remove', profileId: profileIds[1], id: task.id })).rejects.toThrow('недоступен')
    service.stop()
  })
  it('rejects privilege-bearing personalization and does not mutate saved settings', async () => {
    const profile = createProfile(0)
    const { service, connections } = setup(async () => response({ analysis: 'Рекомендация', options: [{ title: 'A', explanation: 'A', preferences: { ...profile.preferences, credentials: ['secret'] } }, { title: 'B', explanation: 'B', preferences: profile.preferences }] }))
    const before = connections.state(profileIds[0])
    const task = assistantTaskSchema.parse(await service.handle({ action: 'start', profileId: profileIds[0], input: { mode: 'personalize', answers: profile.answers, preferences: profile.preferences, trial: 'Создал и соединил два узла.' } }))
    expect((await finished(service, task.id)).status).toBe('failed')
    expect(connections.state(profileIds[0])).toEqual(before)
    service.stop()
  })
  it('cancels assistants on close and revokes graph agents even if a provider never resolves', async () => {
    const { service, connections } = setup(() => new Promise(() => {}))
    const task = assistantTaskSchema.parse(await service.handle({ action: 'start', profileId: profileIds[0], input: { mode: 'design', conversation: [{ role: 'user', content: 'Помоги' }], graphSummary: '' } }))
    service.closeWindow()
    expect((await finished(service, task.id)).status).toBe('cancelled')
    const provider = connections.resolve(profileIds[0], 'qwen3:8b')
    const pending = runAgent(provider, { model: 'qwen3:8b', system: 'Test', input: 'Test', limits: defaultAgentLimits, temperature: 0, tools: [] }, new AbortController().signal)
    const rejected = expect(pending).rejects.toThrow('отключено')
    connections.save(profileIds[0], { provider: 'ollama', port: 11434, model: 'qwen3:8b' }, false)
    await rejected; service.stop()
  })
})
