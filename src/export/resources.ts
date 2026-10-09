import { graphEntries } from '../domain/graphs'
import type { Project, WorkflowNode } from '../domain/schema'
import { json, type ExportFiles } from './package-format'

export const allNodes = (project: Project) => graphEntries(project).flatMap(({ graph }) => graph.nodes)
export const configPath = (node: WorkflowNode) => `${node.type === 'agent' ? 'agents' : 'tools'}/${node.id}.json`
export const promptPath = (id: string) => `prompts/${id}.md`
export function systemPrompt(project: Project, node: Extract<WorkflowNode, { type: 'agent' }>) {
  return [node.config.promptId ? project.prompts.find(p => p.id === node.config.promptId)?.content : undefined, node.config.systemPrompt].filter(Boolean).join('\n\n')
}

export function resourceFiles(project: Project): ExportFiles {
  const files: ExportFiles = { 'schemas/contracts.json': json({ schemaVersion: '0.1', schemas: project.schemas }) }
  for (const prompt of project.prompts) files[promptPath(prompt.id)] = prompt.content
  for (const node of allNodes(project)) {
    if (node.type === 'agent') {
      files[promptPath(node.id)] = systemPrompt(project, node)
      files[configPath(node)] = json({ schemaVersion: '0.1', id: node.id, name: node.title, description: node.description,
        ...node.config, prompt: { system: promptPath(node.id) }, tools: node.config.toolIds ?? [],
      })
    } else if (node.type === 'tool') {
      files[configPath(node)] = json({ schemaVersion: '0.1', id: node.id, name: node.title, description: node.description, ...node.config })
    }
  }
  return files
}
