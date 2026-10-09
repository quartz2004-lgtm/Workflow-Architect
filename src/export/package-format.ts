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
