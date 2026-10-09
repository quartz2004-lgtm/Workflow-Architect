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

import { describe, expect, it } from 'vitest'
import { createId, createNode, createProject } from './factories'
import { deserializeProject, parseProject, serializeProject } from './serialization'
import type { NodeType } from './schema'

describe('project boundary', () => {
  it('round-trips every node type, shared resources and nested graphs without Canvas state', () => {
    const project = createProject('Architecture')
    const types: NodeType[] = ['concept', 'note', 'agent', 'tool', 'trigger', 'logic', 'data', 'human', 'artifact', 'subworkflow']
    project.nodes = types.map(type => createNode(type))
    project.prompts.push({ id: createId(), name: 'Instructions', content: 'Research carefully.' })
    project.schemas.push({ id: createId(), name: 'Input', definition: { type: 'object', properties: { request: { type: 'string' } } } })
    project.subworkflows.push({ id: createId(), title: 'Child', description: '', nodes: [createNode()], edges: [], groups: [], ports: [] })
    expect(deserializeProject(serializeProject(project))).toEqual(project)
    expect(serializeProject(project)).not.toMatch(/selected|dragging|viewport|measured/)
  })
  it('rejects unknown versions, invalid JSON and library-specific fields explicitly', () => {
    expect(() => deserializeProject('{')).toThrow('JSON')
    expect(() => parseProject({ ...createProject(), schemaVersion: '0.2' })).toThrow('версия')
    expect(() => parseProject({ ...createProject(), viewport: { x: 0 } })).toThrow()
    const project = createProject()
    expect(() => parseProject({ ...project, nodes: [{ ...createNode(), selected: true }] })).toThrow()
    expect(() => parseProject({ ...project, nodes: [{ ...createNode(), position: { x: Infinity, y: 0 } }] })).toThrow()
  })
  it('uses a discriminated config, accepts empty engineering drafts and rejects credentials', () => {
    const project = createProject()
    const tool = createNode('tool')
    project.nodes.push(tool)
    expect(parseProject(project)).toEqual(project)
    expect(() => parseProject({ ...project, nodes: [{ ...tool, config: { apiKey: 'secret' } }] })).toThrow()
    project.nodes[0]!.notes = 'sk-' + 'a'.repeat(32)
    expect(() => serializeProject(project)).toThrow('секрет')
    project.nodes[0]!.notes = 'Use OPENAI_API_KEY from the environment.'
    expect(() => serializeProject(project)).not.toThrow()
  })
  it('rejects executable links and oversized imports', () => {
    expect(() => parseProject({ ...createProject(), nodes: [{ ...createNode(), links: ['javascript:alert(1)'] }] })).toThrow()
    expect(() => deserializeProject(' '.repeat(64 * 1024 * 1024 + 1))).toThrow('64 MiB')
  })
})
