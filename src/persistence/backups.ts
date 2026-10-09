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

import { openDB, type DBSchema } from 'idb'
import { createId } from '../domain/factories'

export interface SnapshotBackup { id: string; createdAt: string; sourceVersion: string; raw: string }
interface BackupDB extends DBSchema { snapshots: { key: string; value: SnapshotBackup } }

/** Separate database: upgrading project storage must not invalidate its original snapshots. */
export function createBackupRepository(name = 'workflow-architect-backups') {
  const database = openDB<BackupDB>(name, 1, { upgrade(db) { db.createObjectStore('snapshots', { keyPath: 'id' }) } })
  return {
    async save(raw: string, sourceVersion: string): Promise<void> {
      await (await database).put('snapshots', { id: createId(), createdAt: new Date().toISOString(), sourceVersion, raw })
    },
    async list(): Promise<SnapshotBackup[]> { return (await (await database).getAll('snapshots')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) },
  }
}
