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

import { createId } from '../domain/factories'
import type { Project } from '../domain/schema'

export class ProjectConflictError extends Error {
  constructor() { super('Проект изменён в другом окне. Ваши правки сохранены в памяти. Сохраните отдельную копию, чтобы продолжить без перезаписи чужих изменений.') }
}

export function conflictCopy(project: Project): Project {
  const timestamp = new Date().toISOString()
  return { ...project, project: { ...project.project, id: createId(), name: `${project.project.name.slice(0, 270)} — моя копия`, createdAt: timestamp, updatedAt: timestamp } }
}
