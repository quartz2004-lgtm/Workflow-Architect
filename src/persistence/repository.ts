import { openDB, type DBSchema } from 'idb'
import { assertNoObviousSecrets, deserializeStoredProject, serializeProject } from '../domain/serialization'
import { projectSchema, type Project } from '../domain/schema'
import { ProjectConflictError } from './conflicts'
import { openStoredProject } from './open-project'

interface WorkflowDB extends DBSchema {
  projects: { key: string; value: string }
  preferences: { key: string; value: string }
}
export interface ProjectRepository {
  loadActive(): Promise<string | undefined>
  save(project: Project): Promise<void>
  /** Only after flushing the previous editor; verifies the incoming snapshot before adopting its base. */
  adopt?(project: Project): Promise<void>
}
export interface ProjectSummary { id: string; name: string; updatedAt: string; damaged: boolean }
export interface ManagedProjectRepository extends ProjectRepository {
  list(): Promise<ProjectSummary[]>
  load(id: string): Promise<string | undefined>
}
export function createRepository(name = 'workflow-architect', profile?: { id: string; adoptLegacy: boolean }): ManagedProjectRepository {
  const activeKey = profile ? `active-project:${profile.id}` : 'active-project'
  const bases = new Map<string, string | undefined>()
  const database = openDB<WorkflowDB>(name, 1, { upgrade(db) {
    db.createObjectStore('projects')
    db.createObjectStore('preferences')
  } })
  return {
    async load(id) {
      const raw = await (await database).get('projects', id)
      if (!bases.has(id)) bases.set(id, raw)
      return raw
    },
    async adopt(project) {
      const raw = await (await database).get('projects', project.project.id)
      if (raw !== undefined && serializeProject(deserializeStoredProject(raw)) !== serializeProject(project)) throw new ProjectConflictError()
      bases.set(project.project.id, raw)
    },
    async list() {
      const db = await database
      const tx = db.transaction('projects', 'readonly')
      const [keys, values] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()])
      await tx.done
      return values.map((raw, index) => {
        try { const p = deserializeStoredProject(raw); return { id: keys[index]!, name: p.project.name, updatedAt: p.project.updatedAt, damaged: false } }
        catch {
          let name = 'Повреждённый проект'
          try {
            const value: unknown = JSON.parse(raw)
            const metadata = projectSchema.shape.project.safeParse(value && typeof value === 'object' && 'project' in value ? value.project : null)
            if (metadata.success) { assertNoObviousSecrets(metadata.data.name); name = metadata.data.name }
          } catch { /* Keep a safe fallback title if even the metadata cannot be read. */ }
          return { id: keys[index]!, name, updatedAt: '', damaged: true }
        }
      }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async loadActive() {
      const db = await database
      const id = await db.get('preferences', activeKey) ?? (profile?.adoptLegacy ? await db.get('preferences', 'active-project') : undefined)
      if (!id) return undefined
      const raw = await db.get('projects', id)
      if (!bases.has(id)) bases.set(id, raw)
      return raw
    },
    async save(project) {
      const raw = serializeProject(project)
      const db = await database
      const tx = db.transaction(['projects', 'preferences'], 'readwrite')
      const current = await tx.objectStore('projects').get(project.project.id)
      if (current !== bases.get(project.project.id)) {
        tx.abort()
        await tx.done.catch(() => {})
        throw new ProjectConflictError()
      }
      await tx.objectStore('projects').put(raw, project.project.id)
      await tx.objectStore('preferences').put(project.project.id, activeKey)
      await tx.done
      bases.set(project.project.id, raw)
    },
  }
}

export async function loadProject(repository: ProjectRepository): Promise<Project | undefined> {
  const raw = await repository.loadActive()
  return raw === undefined ? undefined : openStoredProject(raw)
}
