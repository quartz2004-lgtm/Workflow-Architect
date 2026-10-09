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

import { z } from 'zod'
import { projectSchema, type Project } from '../domain/schema'
import { parseProject, ProjectFormatError } from '../domain/serialization'

export type ExportFiles = Record<string, string>
export const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const metadataSchema = projectSchema.shape.project.extend({
  schemaVersion: z.literal('0.1'), mode: projectSchema.shape.settings.shape.defaultMode,
})
const workflowSchema = projectSchema.omit({ project: true })

/** The pair is authoritative; all other package files are generated views. */
export function projectPair(project: Project): ExportFiles {
  const { project: metadata, ...workflow } = parseProject(project)
  return {
    'project.json': json({ schemaVersion: '0.1', ...metadata, mode: workflow.settings.defaultMode }),
    'workflow.json': json(workflow),
  }
}

export function importPair(metadata: unknown, workflow: unknown): Project {
  const meta = metadataSchema.safeParse(metadata)
  const graph = workflowSchema.safeParse(workflow)
  if (!meta.success || !graph.success) throw new ProjectFormatError('Некорректная пара project.json + workflow.json. Требуется формат Workflow Architect 0.1.')
  const { schemaVersion, mode, ...project } = meta.data
  if (mode !== graph.data.settings.defaultMode) throw new ProjectFormatError('Режимы project.json и workflow.json не совпадают.')
  return parseProject({ ...graph.data, schemaVersion, project })
}
