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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { JobManager } from '../runtime/job-manager'
import { runtimeCommandSchema } from '../runtime/service-protocol'
import { profileIds } from '../profiles/schema'
import { createExecutionExample } from './example'
import { createDesktopRunController, type RuntimeBridge } from './desktop-controller'
import type { RunController } from './view-state'

const cleanups: (() => void)[] = [], clients: RunController[] = []
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-client-test-')), listeners = new Set<(message: unknown) => void>()
  const manager = new JobManager(directory, { changed: job => { for (const listener of listeners) listener({ kind: 'changed', profileId: job.profileId, jobId: job.id }) } })
  cleanups.push(() => {
    manager.stop()
    const name = relative(tmpdir(), directory)
    if (!name.startsWith('workflow-client-test-') || name.includes('..') || name.includes('/') || name.includes('\\')) throw new Error('Unsafe cleanup')
    rmSync(directory, { recursive: true, force: true })
  })
  const bridge: RuntimeBridge = {
    state: async () => ({ status: 'ready', message: '', damaged: [] }), reconnect: async () => null,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    request: async value => {
      const command = runtimeCommandSchema.parse(value)
      switch (command.kind) {
        case 'submit': return manager.submit(command.request)
        case 'list': return manager.list(command.profileId)
        case 'get': return manager.get(command.profileId, command.id)
        case 'cancel': return manager.cancel(command.profileId, command.id)
        case 'resume': return manager.resume(command.profileId, command.id)
        case 'remove': return manager.remove(command.profileId, command.id)
        case 'answer': return manager.answer(command.profileId, command.id, command.requestId, command.value)
      }
    },
  }
  const client = (profile = profileIds[0]) => { const value = createDesktopRunController(bridge, profile); clients.push(value); return value }
  return { bridge, manager, client, listeners }
}
afterEach(async () => {
  for (const client of clients.splice(0)) client.dispose()
  for (const cleanup of cleanups.splice(0)) cleanup()
  await new Promise(resolve => setTimeout(resolve, 5))
})
async function ready(client: RunController) { await vi.waitFor(() => expect(client.store.getState().available).toBe(true)) }
describe('desktop run projection', () => {
  it('does not expose an old Human answer while reconnect is waiting for a fresh job projection', async () => {
    const { bridge, manager, client } = fixture(); manager.start()
    const run = client(); run.store.setState({ open: true }); run.connect(); await ready(run)
    const project = createExecutionExample()
    run.start(project, project.nodes[0]!.id, { approved: true, text: 'reconnect' })
    await vi.waitFor(() => expect(run.store.getState().human).not.toBeNull())
    const original = bridge.request
    let release: (() => void) | undefined, hold = true, queued = true
    bridge.request = async value => {
      const result = await original(value), command = runtimeCommandSchema.parse(value)
      if (command.kind === 'get') {
        if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve }) }
        else if (queued) return { ...manager.get(command.profileId, command.id), status: 'queued' }
      }
      return result
    }
    run.native!.refresh()
    await vi.waitFor(() => expect(release).toBeDefined())
    run.native!.reconnect()
    expect(run.store.getState().human).toBeNull()
    release!()
    await vi.waitFor(() => expect(run.store.getState().status).toBe('queued'))
    expect(run.store.getState().human).toBeNull()
    queued = false; run.native!.refresh()
    await vi.waitFor(() => expect(run.store.getState().human).not.toBeNull())
    expect(run.store.getState().status).toBe('waiting')
  })
  it('reattaches after StrictMode-style cleanup and disposing a view never cancels its service job', async () => {
    const { manager, client, listeners } = fixture(); manager.start()
    const first = client(); first.connect(); first.dispose(); first.connect()
    await ready(first)
    expect(listeners.size).toBe(1)
    const project = createExecutionExample()
    first.native!.store.setState({ background: true })
    first.start(project, project.nodes[0]!.id, { approved: true, text: 'persistent' })
    await vi.waitFor(() => expect(first.store.getState().status).toBe('waiting'))
    const id = first.store.getState().jobId!
    first.dispose()
    expect(manager.get(profileIds[0], id).status).toBe('waiting')
    const second = client(); second.store.setState({ open: true }); second.connect()
    await vi.waitFor(() => expect(second.store.getState().human).not.toBeNull())
    expect(second.store.getState().jobId).toBe(id)
    second.answer(second.store.getState().human!.id, true)
    await vi.waitFor(() => expect(second.store.getState().status).toBe('succeeded'))
    expect(JSON.parse(second.store.getState().artifacts[0]!.content)).toEqual({ result: 'PERSISTENT' })
  })
  it('a lost submit acknowledgement retries the same event key without creating a duplicate job', async () => {
    const { bridge, manager, client } = fixture()
    const original = bridge.request, ids: string[] = []
    let lost = true
    bridge.request = async value => {
      const command = runtimeCommandSchema.parse(value)
      if (command.kind === 'list' && lost) return []
      const result = await original(command)
      if (command.kind === 'submit') {
        ids.push(command.request.id)
        if (lost) throw new Error('Отправка не подтверждена')
      }
      return result
    }
    const run = client(); run.connect(); await ready(run)
    const project = createExecutionExample()
    run.start(project, project.nodes[0]!.id, { approved: true, text: 'once' })
    await vi.waitFor(() => expect(run.store.getState().status).toBe('unknown'))
    expect(manager.list(profileIds[0])).toHaveLength(1)
    lost = false; run.native!.retrySubmission()
    await vi.waitFor(() => expect(run.native!.store.getState().pendingSubmission).toBe(false))
    expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1])
    expect(manager.list(profileIds[0])).toHaveLength(1)
  })
  it('ignores a late refresh response after the user switches to a new run', async () => {
    const { bridge, manager, client } = fixture(); manager.start()
    const run = client(); run.connect(); await ready(run)
    const project = createExecutionExample()
    run.start(project, project.nodes[0]!.id, { approved: true, text: 'old' })
    await vi.waitFor(() => expect(run.store.getState().status).toBe('waiting'))
    const original = bridge.request
    let release: ((value: unknown) => void) | undefined, held: unknown
    bridge.request = async value => {
      const result = await original(value)
      if (runtimeCommandSchema.parse(value).kind === 'get') { held = result; return new Promise(resolve => { release = resolve }) }
      return result
    }
    run.native!.refresh()
    await vi.waitFor(() => expect(release).toBeDefined())
    run.native!.newRun()
    release!(held)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(run.store.getState().jobId).toBeNull()
    expect(run.store.getState().status).toBe('idle')
    expect(run.store.getState().human).toBeNull()
  })
})
