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

import { graphEntries } from '../domain/graphs'
import type { Project, WorkflowNode } from '../domain/schema'
import { validateProject } from '../validation/validate-project'
import { allNodes, configPath, promptPath, systemPrompt } from './resources'
import { json } from './package-format'

// User text stays text, including inside Markdown tables and Mermaid labels.
export const prose = (value: string) => value.replace(/[\\`*_{}[\]()<>#|!]/g, '\\$&').replace(/\r?\n/g, ' ')
export function code(value: unknown, language = 'json') {
  const body = typeof value === 'string' ? value : json(value)
  const fence = '`'.repeat(Math.max(3, ...Array.from(body.matchAll(/`+/g), m => m[0].length + 1)))
  return `${fence}${language}\n${body}\n${fence}`
}
const specified = (value: unknown) => value === undefined || value === '' ? 'Не задано — требует решения.' : typeof value === 'string' ? prose(value) : code(value)
const heading = (node: WorkflowNode) => `### ${prose(node.title)}\n\nID: ${node.id}\n\n${prose(node.description)}`

export function agentDocumentation(project: Project): string {
  return allNodes(project).filter(n => n.type === 'agent').map(node => `${heading(node)}

- Role: ${specified(node.config.role)}
- Goal: ${specified(node.description)}
- Config: ${configPath(node)}
- Prompt: ${promptPath(node.id)}

#### Input / Output

${specified(node.config.input)}

${specified(node.config.output)}

#### Tools

${(node.config.toolIds ?? []).map(id => `- ${prose(allNodes(project).find(n => n.id === id)?.title ?? id)} (${id})`).join('\n') || 'Не назначены.'}

#### Constraints / Context

${code({ behavioralRules: node.config.behavioralRules ?? [], permissions: node.config.permissions ?? [], context: node.config.context ?? {}, model: node.config.model ?? null })}

#### Prompts

${code(systemPrompt(project, node), 'markdown')}

#### Fallback behavior

${specified(node.config.execution)}
`).join('\n') || 'Агенты не определены.'
}

export function toolDocumentation(project: Project): string {
  return allNodes(project).filter(n => n.type === 'tool').map(node => `${heading(node)}\n\nConfig: ${configPath(node)}\n\n${code(node.config)}`).join('\n\n') || 'Инструменты не определены.'
}

export function contractDocumentation(project: Project): string {
  const entries = graphEntries(project).flatMap(({ graph, title }) => [
    ...graph.nodes.flatMap(node => {
      const config = node.config as Record<string, unknown>
      return [...['input', 'output', 'schema', 'payload', 'response'].filter(key => config[key] !== undefined).map(key => `### ${prose(node.title)} · ${key}\n\n${node.id} · ${prose(title)}\n\n${code(config[key])}`),
        ...node.ports.filter(port => port.contract).map(port => `### Port ${prose(port.name)}\n\n${node.id} / ${port.id} · ${port.direction} · ${port.kind}\n\n${code(port.contract)}`)]
    }),
    ...graph.edges.filter(edge => edge.contract).map(edge => `### Edge ${prose(edge.label || edge.type)}\n\n${edge.id}\n\n${code(edge.contract)}`),
  ])
  for (const workflow of project.subworkflows) for (const port of workflow.ports) if (port.contract) entries.push(`### Subworkflow port ${prose(port.name)}\n\n${workflow.id} / ${port.id}\n\n${code(port.contract)}`)
  return [...entries, '### Shared schemas', code(project.schemas)].join('\n\n')
}

export function architectureMarkdown(project: Project): string {
  const graphs = graphEntries(project)
  const diagrams = graphs.map(({ graph, title }) => {
    const ids = new Map(graph.nodes.map((node, index) => [node.id, `n${index}`]))
    const label = (text: string) => text.replace(/&/g, '&amp;').replace(/[^\p{L}\p{N} .,:/_-]/gu, ' ').replace(/\s+/g, ' ')
    const lines = ['flowchart LR', ...graph.nodes.map(node => `  ${ids.get(node.id)}["${label(node.title)} · ${node.type}"]`), ...graph.edges.filter(edge => ids.has(edge.sourceNode) && ids.has(edge.targetNode)).map(edge => `  ${ids.get(edge.sourceNode)} -->|"${label(edge.label || edge.type)}"| ${ids.get(edge.targetNode)}`)]
    return `### ${prose(title)}\n\n${code(lines.join('\n'), 'mermaid')}`
  }).join('\n\n')
  return `# ${prose(project.project.name)}

## Overview

${prose(project.project.description) || 'Описание проекта ещё не задано.'}

Schema version: 0.1. Project ID: ${project.project.id}.

## System Diagram

${diagrams}

## Responsibilities and Boundaries

${graphs.map(({ title, graph }) => `### ${prose(title)}\n\n${graph.nodes.map(node => `- **${prose(node.title)}** (${node.type}, ${node.id}): ${prose(node.description) || 'Ответственность требует уточнения.'} Status: ${node.status}.`).join('\n') || 'Граф пуст.'}`).join('\n\n')}

## Agents

${agentDocumentation(project)}

## Tools

${toolDocumentation(project)}

## Data Flow

${graphs.flatMap(({ graph }) => graph.edges.map(edge => `- ${edge.sourceNode}${edge.sourcePort ? `:${edge.sourcePort}` : ''} → ${edge.targetNode}${edge.targetPort ? `:${edge.targetPort}` : ''} · **${edge.type}** · ${prose(edge.label)}${edge.condition ? ` · Condition: ${prose(edge.condition)}` : ''}`)).join('\n') || 'Связи не определены.'}

## Contracts

${contractDocumentation(project)}

## Subworkflows

${project.subworkflows.map(workflow => `### ${prose(workflow.title)}\n\n${prose(workflow.description)}\n\nID: ${workflow.id}. Nodes: ${workflow.nodes.length}. Edges: ${workflow.edges.length}.\n\nBoundary bindings:\n\n${code(allNodes(project).filter(n => n.type === 'subworkflow' && n.config.subworkflowId === workflow.id).map(n => ({ nodeId: n.id, ports: n.ports })))}`).join('\n\n') || 'Вложенные графы не определены.'}

## Architecture Decisions

${allNodes(project).filter(node => node.notes || node.type === 'note').map(node => `- **${prose(node.title)}** (${node.id}): ${prose(node.notes || (node.type === 'note' ? node.config.content || node.description : ''))}`).join('\n')}

- project.json + workflow.json — канонический проект. Остальные файлы — производные представления.
- Стабильные ID задают идентичность; координаты описывают только композицию Canvas.
- Flow, Data, Tool access и Reference имеют разные семантики. Reference не задаёт порядок исполнения.
- Выражения, расписания и инструменты являются спецификацией; этот пакет не содержит исполняющего runtime.

## Open Questions

${validateProject(project).map(issue => `- [${issue.severity}] ${issue.entityId}: ${prose(issue.message)}`).join('\n') || 'Базовая проверка не обнаружила вопросов. Поведение будущей реализации следует проверить отдельно.'}
`
}
