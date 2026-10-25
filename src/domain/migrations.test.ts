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

import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createBackupRepository } from '../persistence/backups'
import { deserializeStoredProject, serializeProject } from './serialization'
import { migrateProjectSnapshot, type ProjectMigration } from './migrations'
import { createNode, createProject } from './factories'
import { defaultAgentLimits } from './agent-config'
import { compileProject } from '../execution/compiler'
import { ExecutionRun } from '../execution/executor'
import { defaultAgentKnowledge } from './knowledge-config'

const raw = readFileSync(new URL('./fixtures/project-0.1-agent.json', import.meta.url), 'utf8')
const historical = raw.replace('"schemaVersion": "0.1"', '"schemaVersion": "test-legacy"')
// Synthetic transition tests the framework; it is intentionally not a production-supported version.
const step: ProjectMigration = {
  from: 'test-legacy', to: '0.5',
  validateSource(value) { if (!value || typeof value !== 'object' || !('project' in value)) throw new Error('Invalid source') },
  transform(value) { return { ...value as object, schemaVersion: '0.5' } },
}

describe('format evolution', () => {
  it('backs up 0.4 and rejects knowledge references smuggled into an old project version', async () => {
    const project = createProject(), node = createNode('agent'), backup = vi.fn()
    node.operation = { kind: 'agent', limits: defaultAgentLimits, minimumWords: 0, requireTools: false }
    project.nodes.push(node)
    const old = JSON.stringify({ ...project, schemaVersion: '0.4' })
    expect(await migrateProjectSnapshot(old, backup)).toEqual(project)
    expect(backup).toHaveBeenCalledExactlyOnceWith(old, '0.4')
    node.operation.knowledge = { ...defaultAgentKnowledge, collections: [{ collectionId: crypto.randomUUID() }] }
    expect(deserializeStoredProject(serializeProject(project))).toEqual(project)
    const disguised = JSON.stringify({ ...project, schemaVersion: '0.4' })
    expect(() => deserializeStoredProject(disguised)).toThrow('schemaVersion 0.5')
    backup.mockClear()
    await expect(migrateProjectSnapshot(disguised, backup)).rejects.toThrow()
    expect(backup).not.toHaveBeenCalled()
  })
  it('backs up 0.3 and refuses connector fields disguised as the older format', async () => {
    const source = createProject(), tool = createNode('tool')
    tool.operation = { kind: 'text-statistics', minimumWords: 600 }; source.nodes.push(tool)
    const old = { ...source, schemaVersion: '0.3' }, raw = JSON.stringify(old), backup = vi.fn()
    expect(await migrateProjectSnapshot(raw, backup)).toEqual(source)
    expect(backup).toHaveBeenCalledExactlyOnceWith(raw, '0.3')
    expect(deserializeStoredProject(raw)).toEqual(old)
    tool.operation = { kind: 'connector', connectionId: crypto.randomUUID(), action: 'files.read', fields: [] }
    const disguised = JSON.stringify({ ...source, schemaVersion: '0.3' })
    expect(() => deserializeStoredProject(disguised)).toThrow('schemaVersion 0.4')
    backup.mockClear()
    await expect(migrateProjectSnapshot(disguised, backup)).rejects.toThrow()
    expect(backup).not.toHaveBeenCalled()
  })
  it('preserves and executes a fixed 0.2 snapshot after migration', async () => {
    const fixture = readFileSync(new URL('./fixtures/project-0.2-execution.json', import.meta.url), 'utf8')
    const backup = vi.fn(), project = await migrateProjectSnapshot(fixture, backup)
    expect(project).toEqual({ ...JSON.parse(fixture), schemaVersion: '0.5' })
    expect(backup).toHaveBeenCalledExactlyOnceWith(fixture, '0.2')
    const compiled = compileProject(project, project.nodes[0]!.id)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) throw new Error('Historical fixture did not compile')
    const result = await new ExecutionRun(compiled.plan).start({ title: 'Old project' })
    expect(result.status).toBe('succeeded')
    expect(JSON.parse(result.artifacts[0]!.content)).toEqual({ title: 'OLD PROJECT' })
  })
  it('backs up 0.2 before upgrading and preserves archived snapshots for runtime history', async () => {
    const source = { ...createProject(), schemaVersion: '0.2' }
    const raw02 = JSON.stringify(source), backup = vi.fn()
    const result = await migrateProjectSnapshot(raw02, backup)
    expect(result).toEqual({ ...source, schemaVersion: '0.5' })
    expect(backup).toHaveBeenCalledExactlyOnceWith(raw02, '0.2')
    expect(deserializeStoredProject(raw02)).toEqual(source)
    const node = createNode('agent')
    node.operation = { kind: 'agent', limits: defaultAgentLimits, minimumWords: 0, requireTools: false }
    const injected = JSON.stringify({ ...source, nodes: [node] })
    expect(() => deserializeStoredProject(injected)).toThrow('schemaVersion 0.3')
    backup.mockClear()
    await expect(migrateProjectSnapshot(injected, backup)).rejects.toThrow()
    expect(backup).not.toHaveBeenCalled()
  })
  it.each(['minimal', 'agent'])('opens the fixed 0.1 %s fixture with exact semantic roundtrip', async name => {
    const fixture = readFileSync(new URL(`./fixtures/project-0.1-${name}.json`, import.meta.url), 'utf8')
    const backup = vi.fn()
    const project = await migrateProjectSnapshot(fixture, backup)
    expect(project).toEqual({ ...JSON.parse(fixture), schemaVersion: '0.5' })
    expect(deserializeStoredProject(serializeProject(project))).toEqual({ ...JSON.parse(fixture), schemaVersion: '0.5' })
    expect(backup).toHaveBeenCalledWith(fixture, '0.1')
  })
  it('durably backs up exact source bytes before any transform', async () => {
    const backups = createBackupRepository(crypto.randomUUID())
    let backupCommitted = false
    const migrated = await migrateProjectSnapshot(historical, async (source, version) => { await backups.save(source, version); backupCommitted = true }, [{ ...step, transform(value) { expect(backupCommitted).toBe(true); return step.transform(value) } }])
    expect(migrated).toEqual({ ...JSON.parse(raw), schemaVersion: '0.5' })
    expect((await backups.list())[0]!.raw).toBe(historical)
  })
  it('does not transform when backup fails and keeps backup after an invalid transform', async () => {
    const transform = vi.fn(step.transform)
    await expect(migrateProjectSnapshot(historical, async () => { throw new Error('Disk full') }, [{ ...step, transform }])).rejects.toThrow('Disk full')
    expect(transform).not.toHaveBeenCalled()
    const backups = createBackupRepository(crypto.randomUUID())
    await expect(migrateProjectSnapshot(historical, backups.save, [{ ...step, transform: () => ({ schemaVersion: '0.1' }) }])).rejects.toThrow()
    expect((await backups.list())[0]!.raw).toBe(historical)
  })
  it('rejects unknown versions and cycles before backup or mutation', async () => {
    const backup = vi.fn()
    await expect(migrateProjectSnapshot(historical, backup)).rejects.toThrow('Неподдерживаемая')
    await expect(migrateProjectSnapshot(historical, backup, [{ ...step, to: 'test-legacy' }])).rejects.toThrow('Цикл')
    expect(backup).not.toHaveBeenCalled()
  })
})
