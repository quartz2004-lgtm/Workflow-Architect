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

const raw = readFileSync(new URL('./fixtures/project-0.1-agent.json', import.meta.url), 'utf8')
const historical = raw.replace('"schemaVersion": "0.1"', '"schemaVersion": "test-legacy"')
// Synthetic transition tests the framework; it is intentionally not a production-supported version.
const step: ProjectMigration = {
  from: 'test-legacy', to: '0.1',
  validateSource(value) { if (!value || typeof value !== 'object' || !('project' in value)) throw new Error('Invalid source') },
  transform(value) { return { ...value as object, schemaVersion: '0.1' } },
}

describe('format evolution', () => {
  it.each(['minimal', 'agent'])('opens the fixed 0.1 %s fixture with exact semantic roundtrip', async name => {
    const fixture = readFileSync(new URL(`./fixtures/project-0.1-${name}.json`, import.meta.url), 'utf8')
    const backup = vi.fn()
    const project = await migrateProjectSnapshot(fixture, backup)
    expect(project).toEqual(JSON.parse(fixture))
    expect(deserializeStoredProject(serializeProject(project))).toEqual(JSON.parse(fixture))
    expect(backup).not.toHaveBeenCalled()
  })
  it('durably backs up exact source bytes before any transform', async () => {
    const backups = createBackupRepository(crypto.randomUUID())
    let backupCommitted = false
    const migrated = await migrateProjectSnapshot(historical, async (source, version) => { await backups.save(source, version); backupCommitted = true }, [{ ...step, transform(value) { expect(backupCommitted).toBe(true); return step.transform(value) } }])
    expect(migrated).toEqual(JSON.parse(raw))
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
