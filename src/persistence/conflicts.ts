import { createId } from '../domain/factories'
import type { Project } from '../domain/schema'

export class ProjectConflictError extends Error {
  constructor() { super('Проект изменён в другом окне. Ваши правки сохранены в памяти. Сохраните отдельную копию, чтобы продолжить без перезаписи чужих изменений.') }
}

export function conflictCopy(project: Project): Project {
  const timestamp = new Date().toISOString()
  return { ...project, project: { ...project.project, id: createId(), name: `${project.project.name.slice(0, 270)} — моя копия`, createdAt: timestamp, updatedAt: timestamp } }
}
