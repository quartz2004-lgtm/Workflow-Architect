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
