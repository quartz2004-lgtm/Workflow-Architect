import { migrateProjectSnapshot } from '../domain/migrations'
import { createBackupRepository } from './backups'

export const openStoredProject = (raw: string) => migrateProjectSnapshot(raw, (source, version) => createBackupRepository().save(source, version))
