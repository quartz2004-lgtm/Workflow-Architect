import { openDB, type DBSchema } from 'idb'
import { assertNoObviousSecrets, deserializeStoredProject, serializeProject } from '../domain/serialization'
import { projectSchema, type Project } from '../domain/schema'

interface WorkflowDB extends DBSchema {
  projects: { key: string; value: string }
  preferences: { key: string; value: string }
}
export interface ProjectRepository {
  loadActive(): Promise<string | undefined>
  save(project: Project): Promise<void>
}
export interface ProjectSummary { id: string; name: string; updatedAt: string; damaged: boolean }
export interface ManagedProjectRepository extends ProjectRepository {
  list(): Promise<ProjectSummary[]>
  load(id: string): Promise<string | undefined>
}
export function createRepository(name = 'workflow-architect'): ManagedProjectRepository {
  const database = openDB<WorkflowDB>(name, 1, { upgrade(db) {
    db.createObjectStore('projects')
    db.createObjectStore('preferences')
  } })
  return {
    async load(id) { return (await database).get('projects', id) },
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
      const id = await db.get('preferences', 'active-project')
      return id ? db.get('projects', id) : undefined
    },
    async save(project) {
      const raw = serializeProject(project)
      const db = await database
      const tx = db.transaction(['projects', 'preferences'], 'readwrite')
      await tx.objectStore('projects').put(raw, project.project.id)
      await tx.objectStore('preferences').put(project.project.id, 'active-project')
      await tx.done
    },
  }
}

export async function loadProject(repository: ProjectRepository): Promise<Project | undefined> {
  const raw = await repository.loadActive()
  return raw === undefined ? undefined : deserializeStoredProject(raw)
}
