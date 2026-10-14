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

import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { openDB } from 'idb'
import { stringify } from 'yaml'
import { createEdge, createId, createNode, createProject } from './factories'
import { migrateProjectSnapshot } from './migrations'
import { deserializeProject, serializeProject } from './serialization'
import { importPackageFiles, importText } from '../export/import-project'
import { projectPair } from '../export/package-format'
import { createArchive, readArchive } from '../export/archive'
import { createBackupRepository } from '../persistence/backups'
import { createRepository, loadProject } from '../persistence/repository'
import { copySelection, cloneClipboard } from '../editor/clipboard'
import { createEditor } from '../editor/session'
import { recoverProject } from '../persistence/recovery'
import { defaultAgentLimits } from './agent-config'

const raw = readFileSync(new URL('./fixtures/project-0.1-agent.json', import.meta.url), 'utf8')
const legacy = JSON.parse(raw)

describe('project execution format 0.4', () => {
  it('preserves new AI operations and remaps parallel join IDs on copy', () => {
    const project = createProject(), agent = createNode('agent'), tool = createNode('tool'), fork = createNode('logic'), join = createNode('logic')
    agent.operation = { kind: 'agent', limits: defaultAgentLimits, minimumWords: 600, requireTools: true }
    tool.operation = { kind: 'text-statistics', minimumWords: 600 }
    fork.operation = { kind: 'parallel', joinNodeId: join.id, concurrency: 2 }
    join.operation = { kind: 'merge' }
    project.nodes.push(agent, tool, fork, join)
    expect(deserializeProject(serializeProject(project))).toEqual(project)
    const copy = cloneClipboard(copySelection(project, project, project.nodes.map(node => node.id), []), project)
    expect(copy.graph.nodes[2]!.operation).toEqual({ kind: 'parallel', joinNodeId: copy.graph.nodes[3]!.id, concurrency: 2 })
    const injected = JSON.stringify({ ...project, schemaVersion: '0.2' })
    const recovery = recoverProject(injected)
    expect(recovery.project?.nodes.filter(node => node.operation).map(node => node.operation!.kind)).toEqual(['merge'])
  })
  it('imports legacy JSON, YAML and ZIP pair with durable original snapshots', async () => {
    const backups = createBackupRepository()
    const before = (await backups.list()).length
    const expected = { ...legacy, schemaVersion: '0.4' }
    expect(await importText(raw, 'legacy.json')).toEqual(expected)
    expect(await importText(stringify(legacy), 'legacy.yaml')).toEqual(expected)
    const { project, ...workflow } = legacy
    const files = { 'project.json': JSON.stringify({ ...project, schemaVersion: '0.1', mode: workflow.settings.defaultMode }), 'workflow.json': JSON.stringify(workflow) }
    expect(await importPackageFiles(await readArchive(await createArchive(files)))).toEqual(expected)
    expect((await backups.list()).length).toBe(before + 3)
    expect((await backups.list()).some(item => item.raw === raw && item.sourceVersion === '0.1')).toBe(true)
    await expect(importPackageFiles({ ...files, 'project.json': files['project.json'].replace('"0.1"', '"0.2"') })).rejects.toThrow('не совпадают')
  })
  it('does not accept new fields disguised as an old format or bypass failed backup', async () => {
    const backup = vi.fn()
    const injected = { ...legacy, nodes: legacy.nodes.map((node: object) => ({ ...node, operation: { kind: 'manual' } })) }
    await expect(migrateProjectSnapshot(JSON.stringify(injected), backup)).rejects.toThrow()
    expect(backup).not.toHaveBeenCalled()
    await expect(migrateProjectSnapshot(raw, async () => { throw new Error('Backup storage full') })).rejects.toThrow('Backup storage full')
    const report = recoverProject(JSON.stringify(injected))
    expect(report.project?.schemaVersion).toBe('0.4')
    expect(report.project?.nodes.every(node => !node.operation)).toBe(true)
    expect(report.issues.some(issue => issue.path.endsWith('.operation'))).toBe(true)
  })
  it('lists old local projects without migration and keeps old bytes until a protected save', async () => {
    const name = createId()
    const db = await openDB(name, 1, { upgrade(db) { db.createObjectStore('projects'); db.createObjectStore('preferences') } })
    await db.put('projects', raw, legacy.project.id)
    await db.put('preferences', legacy.project.id, 'active-project')
    const repository = createRepository(name)
    expect((await repository.list())[0]?.damaged).toBe(false)
    const current = await loadProject(repository)
    expect(current?.schemaVersion).toBe('0.4')
    expect(await db.get('projects', legacy.project.id)).toBe(raw)
    await repository.adopt?.(current!)
    await repository.save(current!)
    expect(JSON.parse(await db.get('projects', legacy.project.id)).schemaVersion).toBe('0.4')
    db.close()
  })
  it('roundtrips operations, undoes edits and remaps branch ports without rewriting literals', async () => {
    const project = createProject()
    const logic = createNode('logic'), target = createNode('data')
    const output = logic.ports.find(port => port.direction === 'output')!
    const falsePort = { ...output, id: createId(), name: 'no' }
    logic.ports.push(falsePort)
    logic.operation = { kind: 'if', truePortId: output.id, falsePortId: falsePort.id, predicate: { source: { kind: 'literal', value: { nodeId: target.id } }, operator: 'equals', value: { nodeId: target.id } } }
    project.nodes.push(logic, target)
    project.edges.push({ ...createEdge(logic.id, target.id, output.id, target.ports[0]!.id), predicate: { source: { kind: 'literal', value: true }, operator: 'is-true' } })
    const editor = createEditor(project)
    editor.execute({ type: 'configure-node', node: { ...target, operation: { kind: 'map', keepInput: false, fields: [] } } })
    const changed = editor.projectStore.getState().project
    expect(deserializeProject(serializeProject(changed))).toEqual(changed)
    expect(await importPackageFiles(projectPair(changed))).toEqual(changed)
    editor.undo()
    expect(editor.projectStore.getState().project.nodes[1]?.operation).toBeUndefined()
    editor.redo()
    expect(editor.projectStore.getState().project.nodes[1]?.operation?.kind).toBe('map')
    const copy = cloneClipboard(copySelection(changed, changed, [logic.id, target.id], []), project)
    const copied = copy.graph.nodes[0]!
    expect(copied.operation?.kind).toBe('if')
    if (copied.operation?.kind !== 'if') throw new Error('Invalid copied operation')
    expect(copied.operation.truePortId).toBe(copied.ports.find(port => port.direction === 'output')!.id)
    expect(copied.operation.truePortId).not.toBe(output.id)
    expect(copied.operation.predicate.value).toEqual({ nodeId: target.id })
    expect(copy.graph.edges[0]?.predicate).toEqual(project.edges[0]?.predicate)
  })
})
